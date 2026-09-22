import { Capacitor, registerPlugin } from '@capacitor/core';
import { CANFrame, ConnectionConfig } from '../types';

interface GvretTcpPluginInterface {
  connect(options: { ip: string; port: number }): Promise<void>;
  disconnect(): Promise<void>;
  addListener(eventName: 'onTcpData', listenerFunc: (event: { data: number[] }) => void): Promise<any>;
}

const GvretTcp = registerPlugin<GvretTcpPluginInterface>('GvretTcp');

export class LiveHardwareStreamer {
  private ws: WebSocket | null = null;
  private tcpListener: any = null;
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
    const port = this.connection.tcpPort || 23; // SuperSuave/can-do defaults to port 23 for raw TCP GVRET stream

    const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
    const isNativeAndroid = Capacitor.isNativePlatform();

    if (port === 23 && isNativeAndroid) {
      this.startTcpAndroid(ip, port);
    } else if (port === 23 && isElectron) {
      this.startTcpElectron(ip, port);
    } else {
      this.startWebSocket(ip, port);
    }
  }

  private async startTcpAndroid(ip: string, port: number) {
    this.onError(`Connecting via Native Android TCP to CAN-Do device at ${ip}:${port}...`);
    try {
      this.tcpListener = await GvretTcp.addListener('onTcpData', (event: { data: number[] }) => {
        if (event && event.data) {
          const uint8 = new Uint8Array(event.data);
          this.parseBinaryData(uint8.buffer);
        }
      });
      await GvretTcp.connect({ ip, port });
      this.onError(`Connected to Android native TCP socket at ${ip}:${port}`);
    } catch (e: any) {
      this.onError(`Android TCP connection error: ${e?.message || e}`);
    }
  }

  private startTcpElectron(ip: string, port: number) {
    this.onError(`Connecting via Electron raw TCP to CAN-Do device at ${ip}:${port}...`);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.connectTcp) {
        electronAPI.connectTcp(ip, port, (buffer: ArrayBuffer) => {
          this.parseBinaryData(buffer);
        });
        electronAPI.onTcpError((err: string) => {
          this.onError(`TCP connection error: ${err}`);
        });
      } else {
        this.startWebSocket(ip, 81);
      }
    } catch (e) {
      this.onError(`Failed to establish TCP connection to ${ip}:${port}`);
    }
  }

  private startWebSocket(ip: string, port: number) {
    const targetPort = port === 23 ? 80 : port;
    const wsUrl = (targetPort === 80 || !targetPort) ? `ws://${ip}/ws` : `ws://${ip}:${targetPort}/ws`;
    this.onError(`Connecting via WebSocket to ${wsUrl}...`);

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
            this.parseBinaryData(event.data);
          }
        } catch (e) {
          console.error('Error parsing live frame:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Live hardware WebSocket error:', err);
        this.onError(`Hardware connection error to ${ip}:${port}.`);
      };

      this.ws.onclose = () => {
        if (this.isRunning) {
          this.reconnectTimer = setTimeout(() => this.start(), 3000);
        }
      };
    } catch (e) {
      this.onError(`Failed to open live connection to ${wsUrl}`);
    }
  }

  private parseBinaryData(arrayBuffer: ArrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length >= 13) {
      const view = new DataView(arrayBuffer);
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

  public stop() {
    this.isRunning = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.tcpListener && this.tcpListener.remove) {
      this.tcpListener.remove();
      this.tcpListener = null;
    }
    try {
      GvretTcp.disconnect();
    } catch (e) {}
  }
}
