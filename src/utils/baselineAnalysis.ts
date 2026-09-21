import { CANFrame, BaselineState, ValueCorrelationMatch, OfflineBaselineAnalysisResult } from '../types';

export function calculateBaselineFromFrames(baselineFrames: CANFrame[]): Map<string, BaselineState> {
  const map = new Map<string, {
    valuesByByte: Map<number, number[]>;
    firstSeen: number;
    lastData: number[];
  }>();

  for (const frame of baselineFrames) {
    let entry = map.get(frame.id);
    if (!entry) {
      entry = {
        valuesByByte: new Map(),
        firstSeen: frame.timestamp,
        lastData: [...frame.data]
      };
      map.set(frame.id, entry);
    }
    entry.lastData = [...frame.data];

    frame.data.forEach((b, idx) => {
      let list = entry!.valuesByByte.get(idx);
      if (!list) {
        list = [];
        entry!.valuesByByte.set(idx, list);
      }
      list.push(b);
    });
  }

  const result = new Map<string, BaselineState>();

  map.forEach((entry, id) => {
    const dlc = entry.lastData.length;
    const baselineData: number[] = new Array(dlc).fill(0);
    const varianceMask: number[] = new Array(dlc).fill(0);

    for (let idx = 0; idx < dlc; idx++) {
      const history = entry.valuesByByte.get(idx) || [];
      if (history.length === 0) {
        baselineData[idx] = 0;
        continue;
      }

      const freqMap = new Map<number, number>();
      let maxCount = 0;
      let modeVal = history[0];

      for (const val of history) {
        const count = (freqMap.get(val) || 0) + 1;
        freqMap.set(val, count);
        if (count > maxCount) {
          maxCount = count;
          modeVal = val;
        }
      }
      baselineData[idx] = modeVal;

      let xorMask = 0;
      for (let i = 1; i < history.length; i++) {
        xorMask = xorMask | (history[i - 1] ^ history[i]);
      }
      varianceMask[idx] = xorMask;
    }

    result.set(id, {
      canId: id,
      baselineData,
      varianceMask,
      capturedAt: Date.now()
    });
  });

  return result;
}

export function analyzeEventWindowAgainstBaseline(
  allFrames: CANFrame[],
  baselineStartIdx: number,
  baselineEndIdx: number,
  eventStartIdx: number,
  eventEndIdx: number
): OfflineBaselineAnalysisResult {
  const safeBaseStart = Math.max(0, Math.min(baselineStartIdx, baselineEndIdx));
  const safeBaseEnd = Math.min(allFrames.length - 1, Math.max(baselineStartIdx, baselineEndIdx));
  const safeEvtStart = Math.max(0, Math.min(eventStartIdx, eventEndIdx));
  const safeEvtEnd = Math.min(allFrames.length - 1, Math.max(eventStartIdx, eventEndIdx));

  const baselineFrames = allFrames.slice(safeBaseStart, safeBaseEnd + 1);
  const eventFrames = allFrames.slice(safeEvtStart, safeEvtEnd + 1);

  const baselineMap = calculateBaselineFromFrames(baselineFrames);

  const pulses: OfflineBaselineAnalysisResult['pulses'] = [];
  const stateShifts: OfflineBaselineAnalysisResult['stateShifts'] = [];
  const newEventIds: OfflineBaselineAnalysisResult['newEventIds'] = [];
  const maskedCounterBytes: OfflineBaselineAnalysisResult['maskedCounterBytes'] = [];

  const eventIdsSeen = new Map<string, { count: number; firstSeen: number; name?: string }>();
  const idByteTraces = new Map<string, Map<number, { frameIdx: number; timestamp: number; value: number }[]>>();

  for (let i = 0; i < eventFrames.length; i++) {
    const frame = eventFrames[i];
    const globalIdx = safeEvtStart + i;

    const seen = eventIdsSeen.get(frame.id) || { count: 0, firstSeen: frame.timestamp, name: frame.name };
    seen.count++;
    eventIdsSeen.set(frame.id, seen);

    let idTrace = idByteTraces.get(frame.id);
    if (!idTrace) {
      idTrace = new Map();
      idByteTraces.set(frame.id, idTrace);
    }

    frame.data.forEach((b, byteIdx) => {
      let byteList = idTrace!.get(byteIdx);
      if (!byteList) {
        byteList = [];
        idTrace!.set(byteIdx, byteList);
      }
      byteList.push({ frameIdx: globalIdx, timestamp: frame.timestamp, value: b });
    });
  }

  eventIdsSeen.forEach((info, id) => {
    if (!baselineMap.has(id)) {
      newEventIds.push({
        canId: id,
        count: info.count,
        firstSeenTime: info.firstSeen,
        name: info.name
      });
    }
  });

  baselineMap.forEach((base, id) => {
    base.varianceMask.forEach((mask: number, byteIdx: number) => {
      if ((mask & 0x0F) === 0x0F || mask === 0xFF) {
        maskedCounterBytes.push({
          canId: id,
          byteIndex: byteIdx,
          pattern: (mask & 0x0F) === 0x0F ? 'Low nibble rolling counter (0-15)' : 'High variance / CRC checksum'
        });
      }
    });
  });

  idByteTraces.forEach((byteMap, id) => {
    const base = baselineMap.get(id);
    if (!base) return;

    byteMap.forEach((trace, byteIdx) => {
      const baseVal = base.baselineData[byteIdx] ?? 0;
      const mask = base.varianceMask[byteIdx] ?? 0;
      const isPureCounter = (mask & 0x0F) === 0x0F && (mask & 0xF0) === 0;

      let inDeviation = false;
      let spikeStartIdx = 0;
      let spikeStartTime = 0;
      let peakValue = baseVal;

      for (let t = 0; t < trace.length; t++) {
        const item = trace[t];
        const currentVal = item.value;

        const relevantDiff = isPureCounter 
          ? (currentVal & 0xF0) !== (baseVal & 0xF0) 
          : currentVal !== baseVal;

        if (relevantDiff && !inDeviation) {
          inDeviation = true;
          spikeStartIdx = item.frameIdx;
          spikeStartTime = item.timestamp;
          peakValue = currentVal;
        } else if (relevantDiff && inDeviation) {
          if (Math.abs(currentVal - baseVal) > Math.abs(peakValue - baseVal)) {
            peakValue = currentVal;
          }
        } else if (!relevantDiff && inDeviation) {
          inDeviation = false;
          const durationMs = Math.round((item.timestamp - spikeStartTime) * 1000);
          const bitMask = peakValue ^ baseVal;

          pulses.push({
            frameIndex: spikeStartIdx,
            timestamp: spikeStartTime,
            canId: id,
            byteIndex: byteIdx,
            baselineValue: baseVal,
            spikedValue: peakValue,
            returnedValue: currentVal,
            bitMask,
            durationMs: Math.max(durationMs, 10),
            name: eventFrames[0]?.name
          });
        }
      }

      if (inDeviation) {
        stateShifts.push({
          canId: id,
          byteIndex: byteIdx,
          fromValue: baseVal,
          toValue: peakValue,
          firstTransitionTime: spikeStartTime,
          frameIndex: spikeStartIdx,
          name: eventFrames[0]?.name
        });
      }
    });
  });

  return {
    baselineRange: {
      startTime: baselineFrames[0]?.timestamp || 0,
      endTime: baselineFrames[baselineFrames.length - 1]?.timestamp || 0,
      startFrameIndex: safeBaseStart,
      endFrameIndex: safeBaseEnd,
      frameCount: baselineFrames.length
    },
    eventRange: {
      startTime: eventFrames[0]?.timestamp || 0,
      endTime: eventFrames[eventFrames.length - 1]?.timestamp || 0,
      startFrameIndex: safeEvtStart,
      endFrameIndex: safeEvtEnd,
      frameCount: eventFrames.length
    },
    pulses,
    stateShifts,
    newEventIds,
    maskedCounterBytes
  };
}

export function correlateCommandToState(
  commandFrame: CANFrame,
  commandByteIdx: number,
  allFrames: CANFrame[],
  targetValue?: number,
  windowMs: number = 350
): ValueCorrelationMatch[] {
  const triggerVal = targetValue !== undefined ? targetValue : commandFrame.data[commandByteIdx];
  const triggerTime = commandFrame.timestamp;
  const windowSec = windowMs / 1000;

  const candidateFrames = allFrames.filter(f => 
    f.timestamp >= (triggerTime - 0.02) && 
    f.timestamp <= (triggerTime + windowSec) &&
    f.id !== commandFrame.id
  );

  const matchesMap = new Map<string, ValueCorrelationMatch>();

  for (const frame of candidateFrames) {
    const timeDeltaMs = Math.round((frame.timestamp - triggerTime) * 1000);

    frame.data.forEach((byte, bIdx) => {
      const isExactMatch = byte === triggerVal;
      
      if (isExactMatch) {
        const key = frame.id + '_D' + bIdx;
        let timingScore = 50;
        if (timeDeltaMs >= 10 && timeDeltaMs <= 150) {
          timingScore = 95 - Math.abs(timeDeltaMs - 45) * 0.3;
        } else if (timeDeltaMs > 150) {
          timingScore = Math.max(30, 80 - (timeDeltaMs - 150) * 0.2);
        }

        const existing = matchesMap.get(key);
        if (!existing || timingScore > existing.score) {
          matchesMap.set(key, {
            canId: frame.id,
            byteIndex: bIdx,
            byteValue: byte,
            timestamp: frame.timestamp,
            timeDeltaMs,
            isExactValueMatch: true,
            isTransitionMatch: true,
            score: Math.min(100, Math.round(timingScore)),
            frameName: frame.name,
            candidateRole: timeDeltaMs >= 5 ? 'state' : 'echo'
          });
        }
      }
    });
  }

  return Array.from(matchesMap.values()).sort((a, b) => b.score - a.score);
}

export function describeBitDifference(baseVal: number, peakVal: number): string {
  const mask = baseVal ^ peakVal;
  const flippedBits: number[] = [];
  for (let i = 0; i < 8; i++) {
    if ((mask & (1 << i)) !== 0) {
      flippedBits.push(i);
    }
  }

  const hexBase = baseVal.toString(16).toUpperCase().padStart(2, '0');
  const hexPeak = peakVal.toString(16).toUpperCase().padStart(2, '0');

  if (flippedBits.length === 1) {
    const bit = flippedBits[0];
    const wentHigh = (peakVal & (1 << bit)) !== 0;
    return 'Bit ' + bit + ' (' + (wentHigh ? '0 -> 1 -> 0' : '1 -> 0 -> 1') + ') [0x' + hexBase + ' -> 0x' + hexPeak + ']';
  }

  return 'Bits [' + flippedBits.join(', ') + '] [0x' + hexBase + ' -> 0x' + hexPeak + ']';
}
