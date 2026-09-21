import React from 'react';
import { Activity, Radio, Download, Upload, Settings, Play, Pause, RefreshCw, Cpu, Smartphone } from 'lucide-react';
import { ConnectionConfig } from '../types';
import { SavvyLensLogo } from './SavvyLensLogo';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  connections: ConnectionConfig[];
  isCapturing: boolean;
  setIsCapturing: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenConnections: () => void;
  onExportLogs: () => void;
  onImportLogs: () => void;
  frameCount: number;
  bufferLimit?: number;
  onBufferLimitChange?: (limit: number) => void;
  messageRate?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  connections,
  isCapturing,
  setIsCapturing,
  onOpenConnections,
  onExportLogs,
  onImportLogs,
  frameCount,
  bufferLimit = 50000,
  onBufferLimitChange,
  messageRate = 0
}) => {
  const activeConn = connections.find(c => c.status === 'Connected') || connections[0];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 select-none">
      <div className="flex items-center space-x-3">
        <SavvyLensLogo size={36} />
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-base tracking-tight text-white">
              SavvyLens
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
              v2.5 Pro
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Automotive CAN Bus Reverse Engineering Studio</p>
        </div>
      </div>

      <div className="flex items-center space-x-3 bg-slate-950/60 px-3 py-1 rounded-lg border border-slate-800 text-xs">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${activeConn?.status === 'Connected' ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
          <span className="font-medium text-slate-200">{activeConn?.name || 'No Connection'}</span>
        </div>
        <span className="text-slate-600">|</span>
        <button 
          onClick={onOpenConnections}
          className="text-blue-400 hover:text-blue-300 font-medium underline underline-offset-2 flex items-center space-x-1 cursor-pointer"
        >
          <Cpu className="w-3.5 h-3.5 mr-0.5" />
          <span>Configure</span>
        </button>
      </div>

      <div className="flex items-center space-x-2 flex-wrap">
        {/* Performance & Frame Buffer Indicator */}
        <div className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-center space-x-2 font-mono">
          <Activity className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>
            <strong className="text-white">{frameCount.toLocaleString()}</strong>
            {bufferLimit > 0 && (
              <span className="text-slate-500 text-[10px]"> / {bufferLimit >= 1000 ? `${bufferLimit / 1000}k` : bufferLimit}</span>
            )}
          </span>
          {messageRate > 0 && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
              {messageRate} msg/s
            </span>
          )}
        </div>

        {/* Ring Buffer Capacity Dropdown for High-Speed captures */}
        {onBufferLimitChange && (
          <div className="flex items-center space-x-1 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 text-xs text-slate-400">
            <span className="text-[11px] font-sans">Cap:</span>
            <select
              value={bufferLimit}
              onChange={(e) => onBufferLimitChange(Number(e.target.value))}
              className="bg-transparent text-slate-200 font-mono text-xs focus:outline-hidden cursor-pointer"
              title="Ring buffer frame limit to optimize Windows RAM consumption"
            >
              <option value={10000} className="bg-slate-900">10k</option>
              <option value={25000} className="bg-slate-900">25k</option>
              <option value={50000} className="bg-slate-900">50k (Std)</option>
              <option value={100000} className="bg-slate-900">100k</option>
              <option value={250000} className="bg-slate-900">250k</option>
              <option value={0} className="bg-slate-900">Unlimited</option>
            </select>
          </div>
        )}

        <button
          onClick={() => setIsCapturing(!isCapturing)}
          title={isCapturing ? "Pause live CAN capture (enables bottom playback bar)" : "Resume live CAN capture (disables bottom playback bar)"}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-colors cursor-pointer ${
            isCapturing 
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20' 
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
          }`}
        >
          {isCapturing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isCapturing ? 'Pause Capture' : 'Resume Capture'}</span>
        </button>

        <button
          id="header-export-button"
          onClick={onExportLogs}
          title="Export CAN Log to CSV"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg border border-slate-700 text-xs font-medium transition active:scale-95 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-slate-300" />
          <span className="hidden sm:inline">Export</span>
        </button>

        <button
          id="header-import-button"
          onClick={onImportLogs}
          title="Import CAN Trace Logs (.csv, .trc, .log, .asc) or DBC Database"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-semibold border border-blue-500/80 shadow-xs shadow-blue-900/30 hover:shadow-blue-500/20 transition-all duration-150 active:scale-95 cursor-pointer select-none"
        >
          <Upload className="w-3.5 h-3.5 text-blue-100" />
          <span className="font-medium">Import</span>
        </button>

        <button
          onClick={() => setActiveTab('mobile-companion')}
          title="Switch to Mobile Companion View (Android / Touch Optimized)"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            activeTab === 'mobile-companion'
              ? 'bg-indigo-600 text-white border-indigo-500 shadow'
              : 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border-slate-700'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Mobile Mode</span>
        </button>
      </div>
    </header>
  );
};
