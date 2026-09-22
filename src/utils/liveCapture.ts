import { CANFrame, ConnectionConfig } from '../types';

export class LiveHardwareStreamer {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private isRunning = false;

  constructor(
    private connection: ConnectionConfig,
    private onFrame: (frame: CANFrame) => void,
    private onError: (msg: string) => void
  ) {}

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const ip = this.connection.ipAddress || '192.168.4.1';
    const port = this.connection.tcpPort || 81;
    const wsUrl = `ws://${ip}:${port}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.onError(`Connected to live hardware at ${ip}:${port}`);
      };

      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data === 'string') {
            const data = JSON.parse(event.data);
            if (data && data.id) {
              const parsed: CANFrame = {
                id: data.id,
                decimalId: parseInt(data.id.replace('0x', ''), 16) || 0,
                name: data.name || `ID_${data.id}`,
                timestamp: data.timestamp || Date.now() / 1000,
                bus: data.bus || 0,
                dlc: data.dlc || data.data?.length || 8,
                data: data.data || [0,0,0,0,0,0,0,0],
                ascii: (data.data || []).map((b: number) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
                count: 1,
                direction: 'RX',
                changedBytes: [false, false, false, false, false, false, false, false],
                changedBits: [0, 0, 0, 0, 0, 0, 0, 0],
                isNewId: true
              };
              this.onFrame(parsed);
            }
          } else if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data);
            if (bytes.length >= 13) {
              const view = new DataView(event.data);
              const timestamp = view.getUint32(0, true) / 1000000.0;
              const canIdRaw = view.getUint32(4, true);
              const canId = (canIdRaw & 0x1FFFFFFF);
              const bus = bytes[8];
              const dlc = bytes[9];
              const data: number[] = [];
              for (let i = 0; i < Math.min(dlc, 8); i++) {
                data.push(bytes[10 + i]);
              }
              const idHex = '0x' + canId.toString(16).toUpperCase();
              const parsed: CANFrame = {
                id: idHex,
                decimalId: canId,
                name: `CAN_${idHex}`,
                timestamp: timestamp > 0 ? timestamp : Date.now() / 1000,
                bus,
                dlc: data.length,
                data,
                ascii: data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
                count: 1,
                direction: 'RX',
                changedBytes: data.map(() => false),
                changedBits: data.map(() => 0),
                isNewId: true
              };
              this.onFrame(parsed);
            }
          }
        } catch (e) {
          console.error('Error parsing live frame:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Live hardware WebSocket error:', err);
        this.onError(`Hardware connection error to ${ip}:${port}. Please verify Wi-Fi connection and adapter IP.`);
      };

      this.ws.onclose = () => {
        if (this.isRunning) {
          this.reconnectTimer = setTimeout(() => this.start(), 3000);
        }
      };
    } catch (e) {
      this.onError(`Failed to open live WebSocket to ${wsUrl}`);
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
