import React, { useState } from 'react';
import { Cpu, Radio, Plus, Check, Trash2, X, Wifi, Sliders, Cable } from 'lucide-react';
import { ConnectionConfig } from '../types';
import { NetworkDeviceDetector } from './NetworkDeviceDetector';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  connections: ConnectionConfig[];
  setConnections: React.Dispatch<React.SetStateAction<ConnectionConfig[]>>;
  onConnectDevice?: (connection: ConnectionConfig) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  connections,
  setConnections,
  onConnectDevice
}) => {
  const [modalTab, setModalTab] = useState<'auto_detect' | 'manual'>('auto_detect');
  const [newConnName, setNewConnName] = useState('');
  const [newConnType, setNewConnType] = useState<'GVRET' | 'GVRET_IP' | 'SocketCAN' | 'Lawicel' | 'MQTT'>('GVRET_IP');
  const [newPort, setNewPort] = useState('/dev/ttyUSB0');
  const [newIpAddress, setNewIpAddress] = useState('192.168.4.1');
  const [newTcpPort, setNewTcpPort] = useState(23);

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnName) return;
    const newConn: ConnectionConfig = {
      id: 'conn-' + Date.now(),
      name: newConnName,
      type: newConnType,
      status: 'Connected',
      baudRate: 500000,
      port: newConnType === 'GVRET_IP' ? `${newIpAddress}:${newTcpPort}` : newPort,
      ipAddress: newConnType === 'GVRET_IP' ? newIpAddress : undefined,
      tcpPort: newConnType === 'GVRET_IP' ? newTcpPort : undefined,
      isLogging: true
    };
    
    if (onConnectDevice) {
      onConnectDevice(newConn);
    } else {
      setConnections(prev => [...prev.map(c => ({ ...c, status: 'Disconnected' as const })), newConn]);
    }
    setNewConnName('');
  };

  const handleConnectToggle = (id: string) => {
    setConnections(prev => prev.map(c => {
      if (c.id === id) {
        return { ...c, status: c.status === 'Connected' ? 'Disconnected' : 'Connected' };
      }
      return { ...c, status: 'Disconnected' }; // Only one active connection at a time
    }));
  };

  const handleDeviceConnect = (newConn: ConnectionConfig) => {
    if (onConnectDevice) {
      onConnectDevice(newConn);
    } else {
      setConnections(prev => {
        const filtered = prev.filter(c => c.ipAddress !== newConn.ipAddress && c.id !== newConn.id);
        return [newConn, ...filtered.map(c => ({ ...c, status: 'Disconnected' as const }))];
      });
    }
  };

  const handleDeviceDisconnect = (connId: string) => {
    setConnections(prev => prev.map(c => c.id === connId ? { ...c, status: 'Disconnected' } : c));
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Cpu className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="font-bold text-base text-white">Hardware & Network Interface Manager</h2>
              <p className="text-xs text-slate-400">Painless pairing for WiCAN and CAN-Do automotive devices</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switching Rail */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 py-2 text-xs">
          <div className="flex items-center space-x-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setModalTab('auto_detect')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1.5 transition ${
                modalTab === 'auto_detect'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Network Detector (WiCAN / CAN-Do)</span>
            </button>

            <button
              onClick={() => setModalTab('manual')}
              className={`px-3 py-1.5 rounded-lg font-medium flex items-center space-x-1.5 transition ${
                modalTab === 'manual'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cable className="w-3.5 h-3.5" />
              <span>Configured Interfaces & Manual Setup</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {modalTab === 'auto_detect' ? (
            <NetworkDeviceDetector
              connections={connections}
              onConnectDevice={handleDeviceConnect}
              onDisconnectDevice={handleDeviceDisconnect}
              onClose={onClose}
            />
          ) : (
            <div className="space-y-6">
              {/* Active Connections List */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configured Interfaces</h3>
                <div className="space-y-2">
                  {connections.map(conn => (
                    <div key={conn.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${conn.status === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                          <span className="font-bold text-sm text-white">{conn.name}</span>
                          <span className="text-[10px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 font-mono">{conn.type}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-mono">
                          {conn.type === 'GVRET_IP' 
                            ? `Endpoint: ${conn.ipAddress || conn.port} (GVRET TCP)`
                            : `Port: ${conn.port} | Baud: ${conn.baudRate}`}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleConnectToggle(conn.id)}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                            conn.status === 'Connected'
                              ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30 hover:bg-rose-600/30'
                              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                          }`}
                        >
                          {conn.status === 'Connected' ? 'Disconnect' : 'Connect'}
                        </button>
                        {connections.length > 1 && (
                          <button
                            onClick={() => setConnections(prev => prev.filter(c => c.id !== conn.id))}
                            className="p-2 text-slate-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Connection Form */}
              <form onSubmit={handleAdd} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <h3 className="text-xs font-semibold text-slate-300">Add Custom Interface</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Interface Name</label>
                    <input
                      type="text"
                      placeholder="e.g. WiCAN ESP32 or CAN-Do Dongle"
                      value={newConnName}
                      onChange={e => setNewConnName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Protocol Type</label>
                    <select
                      value={newConnType}
                      onChange={e => setNewConnType(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="GVRET_IP">GVRET over IP (WiCAN / EVTV)</option>
                      <option value="GVRET">GVRET / SavvyCAN Serial</option>
                      <option value="SocketCAN">SocketCAN (Linux)</option>
                      <option value="Lawicel">Lawicel / CANtact</option>
                      <option value="MQTT">MQTT CAN Bridge</option>
                    </select>
                  </div>
                </div>

                {newConnType === 'GVRET_IP' ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">IP Address / Hostname</label>
                      <input
                        type="text"
                        value={newIpAddress}
                        onChange={e => setNewIpAddress(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                        placeholder="192.168.4.1 or wican.local"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">TCP Port</label>
                      <input
                        type="number"
                        value={newTcpPort}
                        onChange={e => setNewTcpPort(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                        placeholder="23"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Port / Device Path</label>
                    <input
                      type="text"
                      value={newPort}
                      onChange={e => setNewPort(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  Add Interface
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
