export interface CANFrame {
  id: string; // Hex string e.g. "0x123"
  decimalId: number;
  name?: string;
  timestamp: number; // in seconds or ms
  bus: number;
  dlc: number;
  data: number[]; // array of bytes 0-255
  ascii: string;
  count: number;
  periodMs?: number;
  direction?: 'RX' | 'TX';
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
