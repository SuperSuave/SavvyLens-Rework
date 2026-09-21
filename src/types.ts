export interface CANFrame {
  id: string; // Hex string e.g. "0x123"
  decimalId: number;
  name?: string;
  timestamp: number; // in seconds
  bus: number;
  dlc: number;
  data: number[]; // array of bytes 0-255
  ascii: string;
  count: number;
  periodMs?: number;
  direction?: 'RX' | 'TX';
  changedBytes?: boolean[]; // SavvyLens changed byte highlight tracking
  changedBits?: number[]; // SavvyLens 8-bit XOR mask of toggled bits per byte
  prevData?: number[]; // Previous payload for delta bit-level inspection
  isNewId?: boolean; // True if this frame introduced a previously unseen CAN ID
}

export interface DBCSignal {
  name: string;
  startBit: number;
  length: number;
  isBigEndian?: boolean;
  isLittleEndian?: boolean;
  isSigned: boolean;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receiver?: string[];
}

export interface DBCMessage {
  id: number; // decimal
  hexId: string;
  name: string;
  dlc: number;
  sender: string;
  signals: DBCSignal[];
}

export type DeviceFamily = 'WiCAN' | 'CAN-Do' | 'GVRET' | 'Generic';

export interface DetectedDevice {
  id: string;
  name: string;
  family: DeviceFamily;
  model: string;
  ipAddress: string;
  tcpPort: number;
  protocol: 'GVRET_IP' | 'CAN-Do_TCP' | 'WebSocket' | 'MQTT';
  macAddress: string;
  hostname: string;
  firmwareVersion: string;
  rssi?: number; // dBm e.g. -55
  channelCount: number; // 1 or 2 CAN channels
  activeBitrate: number; // e.g. 500000
  secondaryBitrate?: number; // for dual-channel devices
  status: 'Discovered' | 'Connected' | 'Unreachable';
  batteryVoltage?: number; // e.g. 12.6V (OBD-II pin 16)
  lastSeenMs: number;
  isAccessPointMode: boolean;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  type: 'GVRET' | 'GVRET_IP' | 'SocketCAN' | 'Lawicel' | 'MQTT';
  status: 'Connected' | 'Disconnected' | 'Connecting';
  baudRate: number;
  port: string;
  ipAddress?: string;
  tcpPort?: number;
  isLogging: boolean;
  deviceFamily?: DeviceFamily;
  deviceModel?: string;
  macAddress?: string;
  firmwareVersion?: string;
  rssi?: number;
  batteryVoltage?: number;
}

export interface ScriptItem {
  id: string;
  name: string;
  code: string;
  active?: boolean;
  enabled?: boolean;
  description: string;
}

export interface CANMessageTrigger {
  id: string;
  name: string; // e.g. "Steering Wheel Button", "Cruise Set Switch"
  enabled: boolean;
  canId: string; // Hex string e.g. "0x156" or "156"
  targetByte: number; // 1 to 8 for D1 to D8, or 0 for "Any Byte"
  condition: 'equals' | 'mask_set' | 'changed' | 'any_message';
  expectedHex: string; // e.g. "01" or "0x24"
  maskHex?: string; // e.g. "FF" or "01"
  autoDisableOnTrigger?: boolean;
  cooldownMs?: number; // debounce window (ms)
  lastTriggeredTimestamp?: number;
  notes?: string;
}

export interface Bookmark {
  id: string;
  timestamp: number;
  title: string;
  description: string;
  frameId?: string;
  newIdsDetected: string[]; // SavvyLens: CAN IDs recorded at the same time as bookmark
  changedIdsDetected?: string[]; // IDs whose payload changed within the delta window
  deltaWindowMs: number; // e.g. 250ms, 500ms
  triggerMode: 'Manual' | 'Shortcut' | 'Auto-Armed' | 'CAN-Triggered';
  matchedTriggerName?: string;
  matchedCanId?: string;
  matchedByteLabel?: string; // e.g. "Byte D1 == 0x24"
  matchedPayload?: string;
}

export interface UDSScanResult {
  id: string;
  requestHex: string;
  responseHex: string;
  serviceName: string;
  status: 'Supported' | 'No Reply' | 'Denied' | 'Error';
  latencyMs: number;
}

export interface ISOTPMessage {
  id: string;
  sourceId: string;
  targetId: string;
  payloadHex: string;
  decodedText: string;
  timestamp: number;
  serviceName?: string;
}

export interface FileComparisonResult {
  frameId: string;
  name: string;
  countA: number;
  countB: number;
  diffSummary: string;
}

export interface BisectorStep {
  step: number;
  hypothesis: string;
  remainingCandidates: number;
  status: 'Pending' | 'Confirmed' | 'Eliminated';
}

export interface BaselineState {
  canId: string;
  baselineData: number[];
  varianceMask: number[];
  capturedAt: number;
}

export interface ValueCorrelationMatch {
  canId: string;
  byteIndex: number;
  byteValue: number;
  timestamp: number;
  timeDeltaMs: number;
  isExactValueMatch: boolean;
  isTransitionMatch: boolean;
  score: number;
  frameName?: string;
  candidateRole: 'state' | 'echo';
}

export interface OfflineBaselineAnalysisResult {
  baselineRange: {
    startTime: number;
    endTime: number;
    startFrameIndex: number;
    endFrameIndex: number;
    frameCount: number;
  };
  eventRange: {
    startTime: number;
    endTime: number;
    startFrameIndex: number;
    endFrameIndex: number;
    frameCount: number;
  };
  pulses: Array<{
    frameIndex: number;
    timestamp: number;
    canId: string;
    byteIndex: number;
    baselineValue: number;
    spikedValue: number;
    returnedValue: number;
    bitMask: number;
    durationMs: number;
    name?: string;
  }>;
  stateShifts: Array<{
    canId: string;
    byteIndex: number;
    fromValue: number;
    toValue: number;
    firstTransitionTime: number;
    frameIndex: number;
    name?: string;
  }>;
  newEventIds: Array<{
    canId: string;
    count: number;
    firstSeenTime: number;
    name?: string;
  }>;
  maskedCounterBytes: Array<{
    canId: string;
    byteIndex: number;
    pattern: string;
  }>;
}
