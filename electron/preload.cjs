const { contextBridge } = require('electron');
const net = require('net');

let currentClientSocket = null;

contextBridge.exposeInMainWorld('electronAPI', {
  connectTcp: (ip, port, onDataCallback, onErrorCallback) => {
    if (currentClientSocket) {
      currentClientSocket.destroy();
      currentClientSocket = null;
    }

    const client = new net.Socket();
    currentClientSocket = client;

    client.connect(port, ip, () => {
      console.log(`[Electron TCP] Connected to ${ip}:${port}`);
    });

    client.on('data', (data) => {
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      onDataCallback(ab);
    });

    client.on('error', (err) => {
      console.error('[Electron TCP Error]', err);
      if (onErrorCallback) onErrorCallback(err.message);
    });

    client.on('close', () => {
      console.log('[Electron TCP] Connection closed');
    });
  },
  disconnectTcp: () => {
    if (currentClientSocket) {
      currentClientSocket.destroy();
      currentClientSocket = null;
    }
  }
});
