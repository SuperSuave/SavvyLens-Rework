import React, { useState } from 'react';
import { 
  Cpu, Radio, Plus, Trash2, CheckCircle2, AlertCircle, Wifi, 
  Settings2, Activity, ArrowRight, Shield, Zap, Cable, Play, Pause
} from 'lucide-react';
import { ConnectionConfig } from '../types';
import { NetworkDeviceDetector } from './NetworkDeviceDetector';

interface ConnectionsViewProps {
  connections: ConnectionConfig[];
  setConnections: React.Dispatch<React.SetStateAction<ConnectionConfig[]>>;
  onConnectDevice: (connection: ConnectionConfig) => void;
  onDisconnectDevice: (connectionId: string) => void;
  onNavigateToSniffer: () => void;
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({
  connections,
  setConnections,
  onConnectDevice,
  onDisconnectDevice,
  onNavigateToSniffer
}) => {
  const [showManualForm, setShowManualForm] = useState(false);
  const [newConnName, setNewConnName] = useState('');
  const [newConnType, setNewConnType] = useState<ConnectionConfig['type']>('GVRET_IP');
  const [newPort, setNewPort] = useState('/dev/ttyUSB0');
  const [newIpAddress, setNewIpAddress] = useState('192.168.4.1');
  const [newTcpPort, setNewTcpPort] = useState(23);
  const [newBaud, setNewBaud] = useState(500000);

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConnName.trim()) return;

    const newConn: ConnectionConfig = {
      id: 'conn-' + Date.now(),
      name: newConnName.trim(),
      type: newConnType,
      status: 'Connected',
      baudRate: newBaud,
      port: newConnType === 'GVRET_IP' ? `${newIpAddress}:${newTcpPort}` : newPort,
      ipAddress: newConnType === 'GVRET_IP' ? newIpAddress : undefined,
      tcpPort: newConnType === 'GVRET_IP' ? newTcpPort : undefined,
      isLogging: true
    };

    onConnectDevice(newConn);
    setNewConnName('');
    setShowManualForm(false);
  };

  const activeConnection = connections.find(c => c.status === 'Connected');

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto font-sans">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* View Header */}
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2.5">
              <Cpu className="w-6 h-6 text-blue-400" />
              <span>Hardware Interfaces & Network Device Hub</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Painless auto-discovery and zero-config pairing for WiCAN OBD-II (ESP32-C3) running CAN-Do (SuperSuave) or stock MeatPi firmware via GVRET over IP.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {activeConnection && (
              <button
                onClick={onNavigateToSniffer}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm"
              >
                <span>Go to Live Sniffer</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setShowManualForm(!showManualForm)}
              className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              <span>{showManualForm ? 'Hide Manual Form' : 'Add Custom Port'}</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: Automated Network Device Detector for WiCAN & CAN-Do */}
        <NetworkDeviceDetector
          connections={connections}
          onConnectDevice={onConnectDevice}
          onDisconnectDevice={onDisconnectDevice}
        />

        {/* SECTION 2: Manual Custom Connection Form (collapsible) */}
        {showManualForm && (
          <form onSubmit={handleManualAdd} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Cable className="w-4 h-4 text-blue-400" />
                <span>Manual Interface Configuration</span>
              </h3>
              <button 
                type="button" 
                onClick={() => setShowManualForm(false)} 
                className="text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Interface Name</label>
                <input
                  type="text"
                  placeholder="e.g. WiCAN Shop WiFi or CAN-Do USB"
                  value={newConnName}
                  onChange={e => setNewConnName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Protocol / Hardware Driver</label>
                <select
                  value={newConnType}
                  onChange={e => setNewConnType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="GVRET_IP">GVRET over IP (WiCAN / EVTV / Wireless)</option>
                  <option value="GVRET">GVRET / SavvyCAN Serial USB</option>
                  <option value="SocketCAN">SocketCAN (Linux native can0/can1)</option>
                  <option value="Lawicel">Lawicel / CANtact / SLCAN</option>
                  <option value="MQTT">MQTT CAN Bus Telemetry Bridge</option>
                  <option value="Simulated">Software Simulator</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Bus Bitrate</label>
                <select
                  value={newBaud}
                  onChange={e => setNewBaud(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                >
                  <option value={500000}>500,000 bps (Standard Automotive)</option>
                  <option value={250000}>250,000 bps (Heavy Duty / J1939)</option>
                  <option value={1000000}>1,000,000 bps (1 Mbps High-Speed)</option>
                  <option value={125000}>125,000 bps (Body / Comfort CAN)</option>
                </select>
              </div>
            </div>

            {newConnType === 'GVRET_IP' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">IP Address / mDNS Hostname</label>
                  <input
                    type="text"
                    value={newIpAddress}
                    onChange={e => setNewIpAddress(e.target.value)}
                    placeholder="192.168.4.1 or wican.local"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">TCP Port</label>
                  <input
                    type="number"
                    value={newTcpPort}
                    onChange={e => setNewTcpPort(Number(e.target.value))}
                    placeholder="23 (WiCAN) or 10001 (CAN-Do)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Serial Port / Device Node</label>
                <input
                  type="text"
                  value={newPort}
                  onChange={e => setNewPort(e.target.value)}
                  placeholder="/dev/ttyUSB0 or COM3"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <button
              type="submit"
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
            >
              Add and Activate Interface
            </button>
          </form>
        )}

        {/* SECTION 3: Configured Interfaces List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Settings2 className="w-4 h-4 text-blue-400" />
                <span>Configured Hardware Interfaces</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Switch between connected hardware devices or virtual loopbacks
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {connections.length} configured
            </span>
          </div>

          <div className="space-y-3">
            {connections.map(conn => {
              const isConn = conn.status === 'Connected';
              return (
                <div
                  key={conn.id}
                  className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition ${
                    isConn
                      ? 'bg-slate-950 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-800'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${isConn ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      
                      {conn.deviceFamily && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                          conn.deviceFamily === 'WiCAN'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                        }`}>
                          {conn.deviceFamily}
                        </span>
                      )}

                      <span className="font-bold text-sm text-white">{conn.name}</span>
                      <span className="text-[10px] bg-blue-600/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-md font-mono">
                        {conn.type}
                      </span>

                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        isConn ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {conn.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400 font-mono">
                      <span>Port: <strong className="text-slate-300">{conn.port}</strong></span>
                      <span>•</span>
                      <span>Baud: <strong className="text-slate-300">{conn.baudRate / 1000}k</strong></span>
                      {conn.macAddress && (
                        <>
                          <span>•</span>
                          <span>MAC: <strong className="text-slate-300">{conn.macAddress}</strong></span>
                        </>
                      )}
                      {conn.firmwareVersion && (
                        <>
                          <span>•</span>
                          <span>FW: <strong className="text-slate-300">{conn.firmwareVersion}</strong></span>
                        </>
                      )}
                      {conn.batteryVoltage && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">{conn.batteryVoltage.toFixed(1)}V</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        if (isConn) {
                          onDisconnectDevice(conn.id);
                        } else {
                          onConnectDevice(conn);
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
                        isConn
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                      }`}
                    >
                      {isConn ? 'Disconnect' : 'Connect'}
                    </button>

                    {connections.length > 1 && (
                      <button
                        onClick={() => setConnections(prev => prev.filter(c => c.id !== conn.id))}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Remove Interface"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
