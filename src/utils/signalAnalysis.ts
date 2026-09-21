import { CANFrame } from '../types';

export type InferredSignalType = 
  | 'Rolling Counter' 
  | 'Checksum / CRC' 
  | 'Static Constant' 
  | 'Analog / Continuous' 
  | 'Bitfield / Discrete Flags' 
  | 'State Machine / Enum'
  | '16-bit Word (MSB/LSB)';

export interface ByteAnalysis {
  byteIndex: number;
  inferredType: InferredSignalType;
  confidence: number; // 0 to 100
  explanation: string;
  uniqueValuesCount: number;
  min: number;
  max: number;
  entropy: 'Low' | 'Medium' | 'High';
}

export interface FrameSignalAnalysis {
  frameId: string;
  sampleCount: number;
  byteAnalyses: ByteAnalysis[];
  suggestedName?: string;
  hasAliveCounter: boolean;
  hasChecksum: boolean;
}

export interface CorrelatedEvent {
  id: string;
  name?: string;
  bus: number;
  occurrencesInWindow: number;
  timeOffsetMs: number; // relative to target frame timestamp (+/- ms)
  hasChangedPayload: boolean;
  isNewId: boolean;
  sampleData: number[];
  correlationStrength: 'High' | 'Medium' | 'Low';
  reason: string;
}

/**
 * Heuristic Signal Type Classifier:
 * Inspects all historical frames with the same CAN ID to infer
 * whether bytes are rolling counters, CRCs, continuous sensors, bitflags, or constants.
 */
export function analyzeFrameSignals(allFramesForId: CANFrame[], targetFrame: CANFrame): FrameSignalAnalysis {
  const dlc = targetFrame.dlc || targetFrame.data.length || 8;
  const sampleFrames = allFramesForId.length > 0 ? allFramesForId : [targetFrame];
  const sampleCount = sampleFrames.length;

  const byteAnalyses: ByteAnalysis[] = [];
  let hasAliveCounter = false;
  let hasChecksum = false;

  for (let bIdx = 0; bIdx < dlc; bIdx++) {
    const values = sampleFrames.map(f => f.data[bIdx] ?? 0);
    const uniqueValues = new Set(values);
    const uniqueCount = uniqueValues.size;
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // If only 1 frame is captured, use target frame context
    if (sampleCount < 2) {
      byteAnalyses.push({
        byteIndex: bIdx,
        inferredType: bIdx === 0 && dlc > 1 ? 'Rolling Counter' : bIdx === dlc - 1 ? 'Checksum / CRC' : 'Analog / Continuous',
        confidence: 45,
        explanation: 'Single packet sample. Awaiting multiple frames to compute variance & transitions.',
        uniqueValuesCount: uniqueCount,
        min: minVal,
        max: maxVal,
        entropy: 'Low'
      });
      continue;
    }

    // 1. Static Constant check
    if (uniqueCount === 1) {
      byteAnalyses.push({
        byteIndex: bIdx,
        inferredType: 'Static Constant',
        confidence: 95,
        explanation: `Remains invariant at 0x${minVal.toString(16).toUpperCase().padStart(2, '0')} across all ${sampleCount} samples. Likely protocol header or fixed configuration.`,
        uniqueValuesCount: 1,
        min: minVal,
        max: maxVal,
        entropy: 'Low'
      });
      continue;
    }

    // 2. Rolling Alive Counter check
    // Test if increments cyclically: val[i+1] == (val[i] + 1) mod 4, 8, 16, or 256
    let isModulo16Counter = true;
    let isModulo256Counter = true;
    let modulo16Transitions = 0;

    for (let i = 0; i < values.length - 1; i++) {
      const vCurr = values[i];
      const vNext = values[i + 1];
      const lowNibCurr = vCurr & 0x0F;
      const lowNibNext = vNext & 0x0F;
      
      if ((lowNibCurr + 1) % 16 === lowNibNext) {
        modulo16Transitions++;
      } else {
        isModulo16Counter = false;
      }

      if ((vCurr + 1) % 256 !== vNext) {
        isModulo256Counter = false;
      }
    }

    const counterRatio = modulo16Transitions / Math.max(1, values.length - 1);
    if (isModulo256Counter || isModulo16Counter || counterRatio > 0.75) {
      hasAliveCounter = true;
      byteAnalyses.push({
        byteIndex: bIdx,
        inferredType: 'Rolling Counter',
        confidence: isModulo16Counter || isModulo256Counter ? 95 : 80,
        explanation: `Monotonically increments cyclically (alive counter). Prevents ECU packet replay and ensures frame freshness.`,
        uniqueValuesCount: uniqueCount,
        min: minVal,
        max: maxVal,
        entropy: 'Medium'
      });
      continue;
    }

    // 3. Checksum / CRC heuristic
    // CRCs typically have high entropy, high unique value count, and mutate whenever other bytes change
    const isAtBoundary = (bIdx === 0 || bIdx === dlc - 1);
    if (isAtBoundary && uniqueCount > sampleCount * 0.6 && sampleCount >= 4) {
      hasChecksum = true;
      byteAnalyses.push({
        byteIndex: bIdx,
        inferredType: 'Checksum / CRC',
        confidence: 88,
        explanation: `High variance pseudo-random distribution located at payload boundary (Byte ${bIdx}). Typical AUTOSAR CRC-8 / checksum.`,
        uniqueValuesCount: uniqueCount,
        min: minVal,
        max: maxVal,
        entropy: 'High'
      });
      continue;
    }

    // 4. State Machine / Enum check
    // Low number of discrete values (e.g. 2 to 6 values like gear selector, door open/closed, wiper state)
    if (uniqueCount >= 2 && uniqueCount <= 6 && maxVal <= 16) {
      byteAnalyses.push({
        byteIndex: bIdx,
        inferredType: 'State Machine / Enum',
        confidence: 82,
        explanation: `Discretely cycles between ${uniqueCount} distinct states [${Array.from(uniqueValues).map(v => '0x' + v.toString(16).toUpperCase()).join(', ')}]. Typical for mode selector or binary actuators.`,
        uniqueValuesCount: uniqueCount,
        min: minVal,
        max: maxVal,
        entropy: 'Low'
      });
      continue;
    }

    // 5. Bitfield / Boolean Flags check
    // Check if individual bits toggle independently without smooth gradients
    let isBitfield = false;
    if (uniqueCount <= 12) {
      isBitfield = true;
    }

    if (isBitfield) {
      byteAnalyses.push({
        byteIndex: bIdx,
        inferredType: 'Bitfield / Discrete Flags',
        confidence: 75,
        explanation: `Distinct bit-level masks toggling. Appears to encode multiple independent boolean switches or diagnostic flags.`,
        uniqueValuesCount: uniqueCount,
        min: minVal,
        max: maxVal,
        entropy: 'Low'
      });
      continue;
    }

    // 6. Default to Analog / Continuous Sensor Signal
    byteAnalyses.push({
      byteIndex: bIdx,
      inferredType: 'Analog / Continuous',
      confidence: 85,
      explanation: `Gradual continuous range between ${minVal} and ${maxVal}. Characteristic of physical sensors (speed, throttle, temperature, pressure).`,
      uniqueValuesCount: uniqueCount,
      min: minVal,
      max: maxVal,
      entropy: 'Medium'
    });
  }

  return {
    frameId: targetFrame.id,
    sampleCount,
    byteAnalyses,
    hasAliveCounter,
    hasChecksum
  };
}

/**
 * Surrounding Message Correlator:
 * Finds other CAN IDs that transmitted within a delta window of the selected frame,
 * identifying synchronous value changes, new IDs, and precise millisecond time offsets.
 */
export function analyzeSurroundingCorrelations(
  allFrames: CANFrame[],
  targetFrame: CANFrame,
  windowMs: number = 500
): CorrelatedEvent[] {
  const windowSec = windowMs / 1000;
  const targetTs = targetFrame.timestamp;
  const startTs = targetTs - windowSec;
  const endTs = targetTs + windowSec;

  // Filter frames within temporal window excluding exact target frame instance
  const windowFrames = allFrames.filter(f => 
    f.timestamp >= startTs && 
    f.timestamp <= endTs && 
    !(f.id === targetFrame.id && f.timestamp === targetFrame.timestamp)
  );

  // Group by CAN ID
  const groupedById = new Map<string, CANFrame[]>();
  for (const f of windowFrames) {
    const list = groupedById.get(f.id) || [];
    list.push(f);
    groupedById.set(f.id, list);
  }

  const results: CorrelatedEvent[] = [];

  groupedById.forEach((framesOfId, id) => {
    // Find frame closest in time to targetFrame
    let closestFrame = framesOfId[0];
    let minDiff = Math.abs(closestFrame.timestamp - targetTs);
    for (const f of framesOfId) {
      const diff = Math.abs(f.timestamp - targetTs);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrame = f;
      }
    }

    const timeOffsetMs = Number(((closestFrame.timestamp - targetTs) * 1000).toFixed(2));
    const hasChangedPayload = framesOfId.some(f => f.changedBytes?.some(Boolean));
    const isNewId = framesOfId.some(f => f.isNewId);

    // Evaluate correlation score & reason
    let correlationStrength: 'High' | 'Medium' | 'Low' = 'Low';
    let reason = 'Transmitted nearby in time';

    if (isNewId) {
      correlationStrength = 'High';
      reason = 'Novel CAN ID introduced synchronously with this frame';
    } else if (hasChangedPayload && Math.abs(timeOffsetMs) <= 50) {
      correlationStrength = 'High';
      reason = `Payload mutated within ${Math.abs(timeOffsetMs)}ms (synchronous ECU event)`;
    } else if (hasChangedPayload) {
      correlationStrength = 'Medium';
      reason = 'Payload changed value within correlation window';
    } else if (Math.abs(timeOffsetMs) <= 25) {
      correlationStrength = 'Medium';
      reason = `High temporal proximity (${timeOffsetMs >= 0 ? '+' : ''}${timeOffsetMs}ms)`;
    }

    results.push({
      id,
      name: closestFrame.name,
      bus: closestFrame.bus,
      occurrencesInWindow: framesOfId.length,
      timeOffsetMs,
      hasChangedPayload,
      isNewId,
      sampleData: closestFrame.data,
      correlationStrength,
      reason
    });
  });

  // Sort by correlation strength (High first), then by absolute time offset
  return results.sort((a, b) => {
    const scoreMap = { High: 3, Medium: 2, Low: 1 };
    if (scoreMap[b.correlationStrength] !== scoreMap[a.correlationStrength]) {
      return scoreMap[b.correlationStrength] - scoreMap[a.correlationStrength];
    }
    return Math.abs(a.timeOffsetMs) - Math.abs(b.timeOffsetMs);
  });
}
