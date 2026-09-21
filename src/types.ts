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
  isBigEndian: boolean;
  isSigned: boolean;
  factor: number;
  offset: number;
  min: number;
  max: number;
  unit: string;
  receiver: string[];
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
  type: 'GVRET' | 'GVRET_IP' | 'SocketCAN' | 'Lawicel' | 'MQTT' | 'Simulated';
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
  active: boolean;
  description: string;
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
  triggerMode: 'Manual' | 'Shortcut' | 'Auto-Armed';
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
