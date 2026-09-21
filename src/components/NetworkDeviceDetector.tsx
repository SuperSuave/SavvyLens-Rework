import React, { useState, useEffect } from 'react';
import { 
  Wifi, Radio, RefreshCw, Check, Zap, Server, Activity, ShieldCheck, 
  ExternalLink, AlertCircle, ArrowRight, Gauge, Cpu, BatteryCharging, 
  Search, Sliders, CheckCircle2, ChevronRight, Signal
} from 'lucide-react';
import { DetectedDevice, ConnectionConfig, DeviceFamily } from '../types';
import { 
  DEFAULT_DISCOVERABLE_DEVICES, 
  scanLocalSubnet, 
  createConnectionFromDevice, 
  pingDevice 
} from '../utils/deviceDetector';

interface NetworkDeviceDetectorProps {
  connections: ConnectionConfig[];
  onConnectDevice: (connection: ConnectionConfig) => void;
  onDisconnectDevice?: (connectionId: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

export const NetworkDeviceDetector: React.FC<NetworkDeviceDetectorProps> = ({
  connections,
  onConnectDevice,
  onDisconnectDevice,
  onClose,
  compact = false
}) => {
  const [discoveredDevices, setDiscoveredDevices] = useState<DetectedDevice[]>(DEFAULT_DISCOVERABLE_DEVICES);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(100);
  const [scanningIp, setScanningIp] = useState<string>('');
  const [subnet, setSubnet] = useState<string>('192.168.4');
  const [familyFilter, setFamilyFilter] = useState<'All' | 'WiCAN' | 'CAN-Do'>('All');
  const [devicePings, setDevicePings] = useState<Record<string, number>>({});
  const [isPinging, setIsPinging] = useState<Record<string, boolean>>({});

  // Trigger initial network discovery on mount
  useEffect(() => {
    handleScan(subnet);
  }, []);

  const handleScan = async (targetSubnet: string) => {
    setIsScanning(true);
    setScanProgress(0);
    setScanningIp(`${targetSubnet}.1`);

    try {
      const results = await scanLocalSubnet(
        {
          subnet: targetSubnet,
          searchWiCAN: familyFilter === 'All' || familyFilter === 'WiCAN',
          searchCanDo: familyFilter === 'All' || familyFilter === 'CAN-Do',
          probePorts: [23, 10001, 80, 3333]
        },
        (progress, ip) => {
          setScanProgress(progress);
          setScanningIp(ip);
        }
      );
      setDiscoveredDevices(results);
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setIsScanning(false);
      setScanProgress(100);
    }
  };

  const handlePing = async (device: DetectedDevice) => {
    setIsPinging(prev => ({ ...prev, [device.id]: true }));
    try {
      const latency = await pingDevice(device);
      setDevicePings(prev => ({ ...prev, [device.id]: latency }));
    } finally {
      setIsPinging(prev => ({ ...prev, [device.id]: false }));
    }
  };

  const handle1ClickConnect = (device: DetectedDevice) => {
    const newConn = createConnectionFromDevice(device);
    onConnectDevice(newConn);
  };

  // Check if a device is already configured and connected
  const isDeviceConnected = (device: DetectedDevice) => {
    return connections.some(
      c => c.status === 'Connected' && 
      (c.ipAddress === device.ipAddress || c.name.includes(device.name) || c.macAddress === device.macAddress)
    );
  };

  const filteredDevices = discoveredDevices.filter(dev => {
    if (familyFilter === 'All') return true;
    return dev.family === familyFilter;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col text-slate-100 shadow-xl">
      {/* Top Banner & Title */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-600/20 border border-blue-500/40 rounded-xl text-blue-400">
            <Wifi className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-sm text-white">Automated Network Device Detector</h2>
              <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                WiCAN OBD-II & CAN-Do Auto-Discovery
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Zero-config detection for WiCAN OBD-II (ESP32-C3) running CAN-Do (SuperSuave) or MeatPi stock firmware over WiFi & LAN
            </p>
          </div>
        </div>

        {/* Scan Actions & Subnet Selector */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-mono text-[11px]">Subnet:</span>
            <select
              value={subnet}
              onChange={(e) => {
                setSubnet(e.target.value);
                handleScan(e.target.value);
              }}
              className="bg-transparent text-white font-mono text-xs focus:outline-none cursor-pointer"
            >
              <option value="192.168.4" className="bg-slate-900">192.168.4.x (AP Mode)</option>
              <option value="192.168.1" className="bg-slate-900">192.168.1.x (Home/Shop LAN)</option>
              <option value="192.168.0" className="bg-slate-900">192.168.0.x (LAN)</option>
              <option value="10.0.0" className="bg-slate-900">10.0.0.x (Enterprise)</option>
            </select>
          </div>

          <button
            onClick={() => handleScan(subnet)}
            disabled={isScanning}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition ${
              isScanning
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan Subnet'}</span>
          </button>
        </div>
      </div>

      {/* Live Scan Radar & Progress Indicator */}
      {isScanning && (
        <div className="bg-slate-950/90 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center space-x-2 text-blue-400">
            <Radio className="w-4 h-4 animate-ping text-blue-400" />
            <span>Scanning {scanningIp}:23 (GVRET over IP & mDNS probe)...</span>
          </div>
          <div className="flex items-center space-x-3 w-48">
            <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-150"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <span className="text-slate-400 text-[10px]">{scanProgress}%</span>
          </div>
        </div>
      )}

      {/* Filter Tabs: All, CAN-Do (SuperSuave), WiCAN (MeatPi) */}
      <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5">
          <span className="text-slate-400 mr-1 text-[11px]">Firmware / Profile:</span>
          {(['All', 'CAN-Do', 'WiCAN'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setFamilyFilter(tab)}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                familyFilter === tab
                  ? tab === 'CAN-Do'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : tab === 'WiCAN'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab === 'CAN-Do' ? 'CAN-Do (SuperSuave FW)' : tab === 'WiCAN' ? 'WiCAN (MeatPi Stock)' : 'All Devices'}
            </button>
          ))}
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          {filteredDevices.length} node{filteredDevices.length === 1 ? '' : 's'} detected
        </div>
      </div>

      {/* Discovered Hardware Devices Cards */}
      <div className="p-4 space-y-3 overflow-y-auto max-h-[420px]">
        {filteredDevices.length === 0 ? (
          <div className="text-center py-10 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
            <AlertCircle className="w-8 h-8 text-slate-500 mx-auto" />
            <div className="max-w-md mx-auto">
              <p className="font-semibold text-slate-300 text-sm">No hardware detected on {subnet}.x</p>
              <p className="text-xs text-slate-500 mt-1">
                Make sure your computer or tablet is connected to the device WiFi Access Point (e.g. <strong className="text-slate-400">WiCAN_XXXX</strong> or <strong className="text-slate-400">CAN-Do_WiFi</strong>) or change the subnet dropdown above.
              </p>
            </div>
            <button
              onClick={() => handleScan('192.168.4')}
              className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold transition"
            >
              Probe 192.168.4.x (Default AP Mode)
            </button>
          </div>
        ) : (
          filteredDevices.map(device => {
            const isConnected = isDeviceConnected(device);
            const pingMs = devicePings[device.id];
            const isDevicePinging = isPinging[device.id];

            return (
              <div
                key={device.id}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  isConnected
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left Column: Device Identity & Details */}
                  <div className="space-y-1.5 flex-1 min-w-[260px]">
                    <div className="flex items-center space-x-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-blue-500'}`} />
                      
                      {/* Family Badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                        device.family === 'WiCAN'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                      }`}>
                        {device.family}
                      </span>

                      <h3 className="font-bold text-sm text-white">{device.name}</h3>

                      {device.isAccessPointMode && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-mono">
                          AP Mode
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400">
                      {device.model} • FW: <span className="font-mono text-slate-300">{device.firmwareVersion}</span>
                    </p>

                    {/* Network & Protocol Info */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-blue-400 font-bold">
                        {device.ipAddress}:{device.tcpPort}
                      </span>
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300">
                        {device.hostname}
                      </span>
                      <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-400 text-[11px]">
                        MAC: {device.macAddress}
                      </span>
                    </div>

                    {/* Telemetry Pills: Channel Count, Speed, Battery Voltage, RSSI */}
                    <div className="flex flex-wrap items-center gap-2 pt-1.5 text-[11px]">
                      <span className="flex items-center space-x-1 text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                        <Cpu className="w-3 h-3 text-blue-400" />
                        <span>1x CAN (ESP32-C3 TWAI • OBD Pins 6 & 14)</span>
                      </span>

                      {device.family === 'CAN-Do' && (
                        <span className="flex items-center space-x-1 text-indigo-300 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/30 font-mono text-[10px]">
                          <span>SuperSuave/can-do</span>
                        </span>
                      )}

                      <span className="flex items-center space-x-1 text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 font-mono">
                        <Gauge className="w-3 h-3 text-amber-400" />
                        <span>{device.activeBitrate / 1000}k bps</span>
                      </span>

                      {device.batteryVoltage && (
                        <span className="flex items-center space-x-1 text-emerald-300 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                          <BatteryCharging className="w-3 h-3 text-emerald-400" />
                          <span>{device.batteryVoltage.toFixed(1)}V (Pin 16)</span>
                        </span>
                      )}

                      {device.rssi && (
                        <span className="flex items-center space-x-1 text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 font-mono">
                          <Signal className="w-3 h-3 text-blue-400" />
                          <span>{device.rssi} dBm</span>
                        </span>
                      )}

                      {pingMs !== undefined && (
                        <span className="text-emerald-400 font-mono font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          Ping: {pingMs}ms
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end space-x-2 sm:space-x-0 sm:space-y-2 shrink-0">
                    {isConnected ? (
                      <div className="flex items-center space-x-2">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center space-x-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Active Stream</span>
                        </span>

                        {onDisconnectDevice && (
                          <button
                            onClick={() => {
                              const match = connections.find(c => c.ipAddress === device.ipAddress);
                              if (match) onDisconnectDevice(match.id);
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-600/20 text-slate-300 hover:text-rose-300 text-xs transition"
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handle1ClickConnect(device)}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition transform active:scale-95"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-300" />
                        <span>Connect Now</span>
                      </button>
                    )}

                    <button
                      onClick={() => handlePing(device)}
                      disabled={isDevicePinging}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-[11px] font-mono transition flex items-center space-x-1"
                    >
                      <Activity className={`w-3 h-3 ${isDevicePinging ? 'animate-spin text-blue-400' : ''}`} />
                      <span>{isDevicePinging ? 'Pinging...' : 'Ping Test'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Access Hotspot Connect Shortcuts */}
      <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Quick Connect Presets:</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <button
            onClick={() => handle1ClickConnect({
              id: 'quick-cando-ap',
              name: 'CAN-Do AP (SuperSuave)',
              family: 'CAN-Do',
              model: 'WiCAN OBD-II (ESP32-C3)',
              ipAddress: '192.168.4.1',
              tcpPort: 23,
              protocol: 'GVRET_IP',
              macAddress: 'DC:54:75:A8:12:F0',
              hostname: 'cando.local',
              firmwareVersion: 'CAN-Do (SuperSuave/can-do)',
              channelCount: 1,
              activeBitrate: 500000,
              status: 'Discovered',
              lastSeenMs: Date.now(),
              isAccessPointMode: true
            })}
            className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg transition flex items-center space-x-1"
          >
            <span>CAN-Do AP (192.168.4.1:23)</span>
          </button>

          <button
            onClick={() => handle1ClickConnect({
              id: 'quick-wican-ap',
              name: 'WiCAN AP (Stock MeatPi)',
              family: 'WiCAN',
              model: 'WiCAN OBD-II (ESP32-C3)',
              ipAddress: '192.168.4.1',
              tcpPort: 23,
              protocol: 'GVRET_IP',
              macAddress: 'DC:54:75:00:00:01',
              hostname: 'wican.local',
              firmwareVersion: 'MeatPi Stock v3.15',
              channelCount: 1,
              activeBitrate: 500000,
              status: 'Discovered',
              lastSeenMs: Date.now(),
              isAccessPointMode: true
            })}
            className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg transition flex items-center space-x-1"
          >
            <span>WiCAN AP (192.168.4.1:23)</span>
          </button>

          <button
            onClick={() => handle1ClickConnect({
              id: 'quick-cando-mdns',
              name: 'CAN-Do mDNS (cando.local:23)',
              family: 'CAN-Do',
              model: 'WiCAN OBD-II (ESP32-C3)',
              ipAddress: 'cando.local',
              tcpPort: 23,
              protocol: 'GVRET_IP',
              macAddress: 'DC:54:75:11:22:33',
              hostname: 'cando.local',
              firmwareVersion: 'CAN-Do (SuperSuave/can-do)',
              channelCount: 1,
              activeBitrate: 500000,
              status: 'Discovered',
              lastSeenMs: Date.now(),
              isAccessPointMode: false
            })}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-lg transition"
          >
            <span>cando.local:23</span>
          </button>

          <button
            onClick={() => handle1ClickConnect({
              id: 'quick-wican-mdns',
              name: 'WiCAN mDNS (wican.local:23)',
              family: 'WiCAN',
              model: 'WiCAN OBD-II (ESP32-C3)',
              ipAddress: 'wican.local',
              tcpPort: 23,
              protocol: 'GVRET_IP',
              macAddress: 'DC:54:75:AA:BB:CC',
              hostname: 'wican.local',
              firmwareVersion: 'MeatPi Stock v3.15',
              channelCount: 1,
              activeBitrate: 500000,
              status: 'Discovered',
              lastSeenMs: Date.now(),
              isAccessPointMode: false
            })}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition"
          >
            <span>wican.local:23</span>
          </button>
        </div>
      </div>
    </div>
  );
};
