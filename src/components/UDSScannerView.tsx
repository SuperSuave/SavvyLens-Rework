import React, { useState } from 'react';
import { Search, Shield, Play, Square, CheckCircle, AlertTriangle, Cpu } from 'lucide-react';
import { UDSScanResult } from '../types';

export const UDSScannerView: React.FC = () => {
  const [startId, setStartId] = useState('0x7E0');
  const [endId, setEndId] = useState('0x7E7');
  const [scanType, setScanType] = useState<'ReadByID' | 'SessionCtrl' | 'ECUReset' | 'SecurityAccess' | 'TesterPresent'>('SessionCtrl');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<UDSScanResult[]>([
    { id: '0x7E0', requestHex: '10 03', responseHex: '50 03 00 32 01 F4', serviceName: 'Diagnostic Session Control (0x10)', status: 'Supported', latencyMs: 14 },
    { id: '0x7E0', requestHex: '3E 00', responseHex: '7E 00', serviceName: 'Tester Present (0x3E)', status: 'Supported', latencyMs: 8 },
    { id: '0x7E0', requestHex: '22 F1 90', responseHex: '62 F1 90 4E 69 73 73 61', serviceName: 'Read Data By Identifier (0x22 VIN)', status: 'Supported', latencyMs: 22 },
    { id: '0x7E1', requestHex: '10 03', responseHex: '', serviceName: 'Diagnostic Session Control (0x10)', status: 'No Reply', latencyMs: 50 },
  ]);

  const handleStartScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setResults(prev => [
        { id: '0x7E2', requestHex: '10 02', responseHex: '50 02', serviceName: 'Programming Session (0x10)', status: 'Supported', latencyMs: 19 },
        ...prev
      ]);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Shield className="w-5 h-5 text-blue-400" />
              <span>UDS Node Scanner & Diagnostic Fuzzing</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Discover Unified Diagnostic Services (ISO 14229) compliant ECUs, read VINs, and test security access states</p>
          </div>

          <button
            onClick={isScanning ? () => setIsScanning(false) : handleStartScan}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm ${
              isScanning ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isScanning ? <Square className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            <span>{isScanning ? 'Stop UDS Scan' : 'Start UDS Scan'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-300">Scan Parameters</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Start ID</label>
                <input
                  type="text"
                  value={startId}
                  onChange={e => setStartId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">End ID</label>
                <input
                  type="text"
                  value={endId}
                  onChange={e => setEndId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Scan Service Type</label>
              <select
                value={scanType}
                onChange={e => setScanType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                <option value="SessionCtrl">Diagnostic Session Control (0x10)</option>
                <option value="ReadByID">Read Data By Identifier (0x22)</option>
                <option value="ECUReset">ECU Reset (0x11)</option>
                <option value="SecurityAccess">Security Access (0x27)</option>
                <option value="TesterPresent">Tester Present (0x3E)</option>
              </select>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-medium text-slate-300">UDS Protocol Standard</div>
              <div>Automatically listens for responses at Request ID + 8 (e.g. 0x7E0 → 0x7E8) with adaptive offset support.</div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-300">Scan Results ({results.length})</span>
              <span className="text-xs text-slate-400 font-mono">Bus: can0</span>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">ECU ID</th>
                    <th className="py-2.5 px-3">Service</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Response Hex</th>
                    <th className="py-2.5 px-3 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {results.map((res, i) => (
                    <tr key={i} className="hover:bg-slate-950/40">
                      <td className="py-2.5 px-3 font-bold text-blue-400">{res.id}</td>
                      <td className="py-2.5 px-3 text-slate-200 font-sans">{res.serviceName}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                          res.status === 'Supported' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {res.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{res.responseHex || '-'}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">{res.latencyMs}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
