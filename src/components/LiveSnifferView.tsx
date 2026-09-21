import React, { useState, useMemo } from 'react';
import { 
  Search, Trash2, Filter, ArrowUpRight, ArrowDownLeft, 
  Shield, Eye, Zap, Bookmark as BookmarkIcon, Sparkles, SlidersHorizontal, 
  BrainCircuit, GitMerge, Clock, Activity, Info, ListFilter, Check, X,
  Radio, Gauge, Hash, RefreshCw
} from 'lucide-react';
import { CANFrame, DBCMessage } from '../types';
import { 
  analyzeFrameSignals, 
  analyzeSurroundingCorrelations, 
  FrameSignalAnalysis, 
  CorrelatedEvent,
  InferredSignalType 
} from '../utils/signalAnalysis';

interface LiveSnifferViewProps {
  frames: CANFrame[];
  onClearFrames: () => void;
  dbcMessages: DBCMessage[];
  onSendCustomFrame: (id: string, data: number[]) => void;
  onQuickBookmark?: () => void;
  onBookmarkFromFrame?: (frame: CANFrame, correlatedIds: string[]) => void;
  initialSearchTerm?: string;
}

type FilterMode = 'all' | 'changed' | 'new_ids' | 'rx' | 'tx';
type InspectorTab = 'matrix' | 'signal_types' | 'correlations';

export const LiveSnifferView: React.FC<LiveSnifferViewProps> = ({
  frames,
  onClearFrames,
  dbcMessages,
  onSendCustomFrame,
  onQuickBookmark,
  onBookmarkFromFrame,
  initialSearchTerm = ''
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [highlightChanges, setHighlightChanges] = useState(true);
  const [selectedFrame, setSelectedFrame] = useState<CANFrame | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('matrix');
  const [correlationWindowMs, setCorrelationWindowMs] = useState<number>(500);

  // Synchronize if initialSearchTerm updates
  React.useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);

  // SavvyLens Enhanced Search & Filtering Engine
  const filteredFrames = useMemo(() => {
    return frames.filter(frame => {
      // 1. Filter mode condition
      if (filterMode === 'changed') {
        const hasChanges = frame.changedBytes?.some(c => c);
        if (!hasChanges) return false;
      } else if (filterMode === 'new_ids') {
        if (!frame.isNewId) return false;
      } else if (filterMode === 'rx') {
        if (frame.direction !== 'RX') return false;
      } else if (filterMode === 'tx') {
        if (frame.direction !== 'TX') return false;
      }

      // 2. Enhanced Search Query Parser
      if (!searchTerm.trim()) return true;

      const term = searchTerm.trim().toLowerCase();

      // Advanced syntax support (e.g. data:de ad or id:123 or b0:01)
      if (term.startsWith('data:')) {
        const hexPattern = term.slice(5).replace(/\s+/g, '');
        const frameHex = frame.data.map(b => b.toString(16).padStart(2, '0')).join('');
        return frameHex.includes(hexPattern);
      }

      if (term.startsWith('id:')) {
        const queryId = term.slice(3);
        return frame.id.toLowerCase().includes(queryId) || frame.decimalId.toString().includes(queryId);
      }

      if (term.startsWith('b0:')) {
        const b0Hex = term.slice(3).padStart(2, '0');
        const frameB0 = (frame.data[0] || 0).toString(16).padStart(2, '0');
        return frameB0 === b0Hex;
      }

      // Standard multi-field search
      const hexData = frame.data.map(b => b.toString(16).padStart(2, '0')).join(' ');
      return (
        frame.id.toLowerCase().includes(term) ||
        frame.decimalId.toString().includes(term) ||
        (frame.name && frame.name.toLowerCase().includes(term)) ||
        hexData.includes(term) ||
        frame.ascii.toLowerCase().includes(term)
      );
    });
  }, [frames, filterMode, searchTerm]);

  // SavvyLens Signal Type Heuristic Analysis
  const signalAnalysis = useMemo<FrameSignalAnalysis | null>(() => {
    if (!selectedFrame) return null;
    const framesForId = frames.filter(f => f.id.toLowerCase() === selectedFrame.id.toLowerCase());
    return analyzeFrameSignals(framesForId, selectedFrame);
  }, [selectedFrame, frames]);

  // SavvyLens Surrounding Event Correlation Analysis
  const correlatedEvents = useMemo<CorrelatedEvent[]>(() => {
    if (!selectedFrame) return [];
    return analyzeSurroundingCorrelations(frames, selectedFrame, correlationWindowMs);
  }, [selectedFrame, frames, correlationWindowMs]);

  const matchedDbcMsg = selectedFrame 
    ? dbcMessages.find(m => m.hexId.toLowerCase() === selectedFrame.id.toLowerCase() || m.id === selectedFrame.decimalId)
    : null;

  // Signal type visual tag styling helper
  const getSignalTypeBadge = (type: InferredSignalType) => {
    switch (type) {
      case 'Rolling Counter':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'Checksum / CRC':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'Static Constant':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'Analog / Continuous':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      case 'Bitfield / Discrete Flags':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'State Machine / Enum':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <div className="flex-1 flex flex-col min-w-0">
        {/* SavvyLens Enhanced Toolbar */}
        <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 select-none">
          <div className="flex items-center space-x-2 flex-1 min-w-[280px] max-w-lg">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                id="savvylens-search-input"
                type="text"
                placeholder="SavvyLens Enhanced Search (e.g. 0x123, data:DE AD, b0:01, ASCII)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 font-mono"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* SavvyLens Quick Filter Pills */}
          <div className="flex items-center space-x-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                filterMode === 'all' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('changed')}
              title="SavvyLens: Show only frames with changed data bytes/bits"
              className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition ${
                filterMode === 'changed' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Changed Bits</span>
            </button>
            <button
              onClick={() => setFilterMode('new_ids')}
              title="SavvyLens: Show only newly introduced CAN IDs"
              className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition ${
                filterMode === 'new_ids' 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-indigo-300'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>New IDs</span>
            </button>
            <button
              onClick={() => setFilterMode('rx')}
              className={`px-2 py-1 rounded-lg font-medium transition ${
                filterMode === 'rx' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              RX
            </button>
            <button
              onClick={() => setFilterMode('tx')}
              className={`px-2 py-1 rounded-lg font-medium transition ${
                filterMode === 'tx' 
                  ? 'bg-amber-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-amber-300'
              }`}
            >
              TX
            </button>
          </div>

          {/* Actions & Toggles */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setHighlightChanges(!highlightChanges)}
              title="SavvyLens: Toggle highlighting of changed data bits and bytes"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center space-x-1.5 transition ${
                highlightChanges
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Highlight Changes</span>
            </button>

            {onQuickBookmark && (
              <button
                onClick={onQuickBookmark}
                title="SavvyLens: Quick Timeline Bookmark (Shortcut: [B])"
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <BookmarkIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bookmark</span>
                <span className="font-mono text-[10px] bg-blue-600/40 px-1 rounded text-white">[B]</span>
              </button>
            )}

            <button
              onClick={onClearFrames}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition border border-slate-700"
              title="Clear sniffer frame buffer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {/* CAN Data Grid Table with SavvyLens Bit/Byte Change Highlighting */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead className="bg-slate-900/95 text-slate-400 sticky top-0 border-b border-slate-800 select-none z-10">
              <tr>
                <th className="py-2.5 px-3 font-medium">Timestamp</th>
                <th className="py-2.5 px-3 font-medium">Bus</th>
                <th className="py-2.5 px-3 font-medium">Dir</th>
                <th className="py-2.5 px-3 font-medium">CAN ID</th>
                <th className="py-2.5 px-3 font-medium">Message Name</th>
                <th className="py-2.5 px-3 font-medium">DLC</th>
                <th className="py-2.5 px-3 font-medium">Data Bytes (Hex & Bit Changes)</th>
                <th className="py-2.5 px-3 font-medium">ASCII</th>
                <th className="py-2.5 px-3 font-medium text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredFrames.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500 font-sans">
                    <div className="max-w-md mx-auto space-y-2">
                      <p className="font-medium text-slate-400">No CAN frames match current filter.</p>
                      <p className="text-xs text-slate-500">
                        Connect hardware, transmit a test frame, or adjust search criteria.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredFrames.map((frame, idx) => {
                  const isSelected = selectedFrame?.id === frame.id && selectedFrame?.timestamp === frame.timestamp;
                  return (
                    <tr 
                      key={`${frame.id}-${frame.timestamp}-${idx}`}
                      onClick={() => setSelectedFrame(frame)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-600/20 border-l-2 border-blue-500' 
                          : 'hover:bg-slate-900/60'
                      }`}
                    >
                      <td className="py-2 px-3 text-slate-400">+{frame.timestamp.toFixed(3)}s</td>
                      <td className="py-2 px-3 text-slate-300">can{frame.bus}</td>
                      <td className="py-2 px-3">
                        {frame.direction === 'TX' ? (
                          <span className="flex items-center text-amber-400 font-bold"><ArrowUpRight className="w-3 h-3 mr-0.5" /> TX</span>
                        ) : (
                          <span className="flex items-center text-emerald-400 font-medium"><ArrowDownLeft className="w-3 h-3 mr-0.5" /> RX</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-bold text-blue-400 flex items-center space-x-1.5">
                        <span>{frame.id}</span>
                        {frame.isNewId && (
                          <span className="text-[9px] font-sans px-1 py-0.2 bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded font-semibold">
                            NEW
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-200 font-sans font-medium">{frame.name || 'Unknown'}</td>
                      <td className="py-2 px-3 text-slate-400">{frame.dlc}</td>

                      {/* SavvyLens Byte & Bit Change Highlighting */}
                      <td className="py-2 px-3 tracking-wider">
                        <div className="flex items-center space-x-1.5 font-mono">
                          {frame.data.map((byte, bIdx) => {
                            const isChanged = highlightChanges && frame.changedBytes?.[bIdx];
                            const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
                            return (
                              <span
                                key={bIdx}
                                title={isChanged ? `Byte ${bIdx} changed! Prev: 0x${(frame.prevData?.[bIdx] ?? byte).toString(16).toUpperCase().padStart(2, '0')}` : `Byte ${bIdx}`}
                                className={`px-1 rounded transition ${
                                  isChanged
                                    ? 'bg-amber-500/25 text-amber-300 font-bold border border-amber-500/40 shadow-xs'
                                    : 'text-slate-300'
                                }`}
                              >
                                {hexStr}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-2 px-3 text-slate-400 font-sans">{frame.ascii}</td>
                      <td className="py-2 px-3 text-right text-slate-400">{frame.count}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SavvyLens Frame Inspector: Multi-Tab reverse engineering panel */}
      {selectedFrame && (
        <div className="w-[420px] bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden select-none">
          {/* Top Panel Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-blue-400" />
              <div>
                <h3 className="font-bold text-sm text-white">SavvyLens Inspector</h3>
                <span className="text-[11px] font-mono text-blue-400">{selectedFrame.id} @ +{selectedFrame.timestamp.toFixed(3)}s</span>
              </div>
            </div>
            <button 
              onClick={() => setSelectedFrame(null)}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
            >
              Close
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 text-xs">
            <button
              onClick={() => setInspectorTab('matrix')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1.5 transition ${
                inspectorTab === 'matrix' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Bit Matrix</span>
            </button>

            <button
              onClick={() => setInspectorTab('signal_types')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1.5 transition ${
                inspectorTab === 'signal_types' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Signal Analysis</span>
            </button>

            <button
              onClick={() => setInspectorTab('correlations')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1.5 transition ${
                inspectorTab === 'correlations' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Correlated</span>
              {correlatedEvents.length > 0 && (
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded-full font-mono">
                  {correlatedEvents.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab Body Container */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs">
            {/* Meta Card (Always visible at top of inspector) */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">CAN ID:</span>
                <span className="font-mono font-bold text-blue-400 text-sm">{selectedFrame.id} (Dec: {selectedFrame.decimalId})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Message Name:</span>
                <span className="font-medium text-slate-200">{selectedFrame.name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-mono text-slate-300">+{selectedFrame.timestamp.toFixed(4)}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Bus / Direction:</span>
                <span className="font-mono text-slate-300">can{selectedFrame.bus} ({selectedFrame.direction || 'RX'})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Payload DLC:</span>
                <span className="font-mono text-slate-300">{selectedFrame.dlc} bytes</span>
              </div>
            </div>

            {/* TAB 1: Bit Matrix & Decoded DBC */}
            {inspectorTab === 'matrix' && (
              <>
                <div>
                  <div className="text-slate-300 font-semibold mb-2 flex items-center justify-between">
                    <span className="flex items-center space-x-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                      <span>SavvyLens 8x8 Bit Matrix</span>
                    </span>
                    <span className="text-[10px] text-amber-400 font-medium">Highlighting Toggled Bits</span>
                  </div>

                  <div className="space-y-2 font-mono text-[11px]">
                    {selectedFrame.data.map((byte, bIdx) => {
                      const xorMask = selectedFrame.changedBits?.[bIdx] || 0;
                      const isByteChanged = selectedFrame.changedBytes?.[bIdx];
                      const bitStr = byte.toString(2).padStart(8, '0');
                      
                      return (
                        <div 
                          key={bIdx} 
                          className={`p-2 rounded-lg border transition ${
                            isByteChanged 
                              ? 'bg-amber-950/20 border-amber-500/40' 
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between text-slate-400 mb-1.5 text-[10px]">
                            <span>Byte {bIdx} (0x{byte.toString(16).toUpperCase().padStart(2, '0')})</span>
                            {isByteChanged && <span className="text-amber-400 font-semibold">Toggled Bits Detected</span>}
                          </div>

                          <div className="grid grid-cols-8 gap-1 text-center font-bold">
                            {bitStr.split('').map((bitChar, bitPos) => {
                              const bitIndex = 7 - bitPos; // MSB to LSB
                              const bitChanged = (xorMask & (1 << bitIndex)) !== 0;
                              return (
                                <div 
                                  key={bitPos}
                                  title={`Bit ${bitIndex}: ${bitChar}${bitChanged ? ' (Changed)' : ''}`}
                                  className={`py-1 rounded text-center transition ${
                                    bitChanged
                                      ? 'bg-amber-500 text-slate-950 font-extrabold ring-1 ring-amber-400'
                                      : bitChar === '1'
                                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                                      : 'bg-slate-900 text-slate-500 border border-slate-800'
                                  }`}
                                >
                                  {bitChar}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* DBC Decoded Signals */}
                {matchedDbcMsg ? (
                  <div>
                    <div className="text-slate-300 font-semibold mb-2 flex items-center justify-between">
                      <span>DBC Decoded Signals</span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">Matched</span>
                    </div>
                    <div className="space-y-2">
                      {matchedDbcMsg.signals.map((sig, sIdx) => {
                        const rawVal = (selectedFrame.data[0] || 0) + ((selectedFrame.data[1] || 0) << 8);
                        const scaled = rawVal * sig.factor + sig.offset;
                        return (
                          <div key={sIdx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                            <div className="flex justify-between font-medium text-slate-200">
                              <span>{sig.name}</span>
                              <span className="text-blue-400 font-mono">{scaled.toFixed(2)} {sig.unit}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                              <span>Bits {sig.startBit} - {sig.startBit + sig.length}</span>
                              <span>Range: {sig.min} to {sig.max} {sig.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-slate-400 text-center">
                    No DBC signal definition found for CAN ID {selectedFrame.id}.
                  </div>
                )}
              </>
            )}

            {/* TAB 2: SavvyLens Signal Type Heuristic Analysis */}
            {inspectorTab === 'signal_types' && signalAnalysis && (
              <div className="space-y-4">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 flex items-center space-x-1.5">
                      <BrainCircuit className="w-4 h-4 text-blue-400" />
                      <span>Inferred Signal Archetypes</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {signalAnalysis.sampleCount} frames analyzed
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    SavvyLens evaluates transition monotonicity, bit distributions, and entropy to infer ECU signal types without DBC files.
                  </p>
                  <div className="flex items-center space-x-2 pt-1">
                    {signalAnalysis.hasAliveCounter && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
                        ✓ Alive Counter Found
                      </span>
                    )}
                    {signalAnalysis.hasChecksum && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                        ✓ CRC/Checksum Found
                      </span>
                    )}
                  </div>
                </div>

                {/* Byte by Byte Inferred Type Cards */}
                <div className="space-y-2.5">
                  {signalAnalysis.byteAnalyses.map((byteAnalysis) => {
                    const currentByteVal = selectedFrame.data[byteAnalysis.byteIndex] ?? 0;
                    return (
                      <div 
                        key={byteAnalysis.byteIndex}
                        className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-white text-xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                              Byte {byteAnalysis.byteIndex}
                            </span>
                            <span className="font-mono text-slate-400 text-xs">
                              0x{currentByteVal.toString(16).toUpperCase().padStart(2, '0')}
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getSignalTypeBadge(byteAnalysis.inferredType)}`}>
                            {byteAnalysis.inferredType}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {byteAnalysis.explanation}
                        </p>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-900 font-mono">
                          <span>Confidence: <strong className="text-emerald-400">{byteAnalysis.confidence}%</strong></span>
                          <span>Range: 0x{byteAnalysis.min.toString(16).toUpperCase()}–0x{byteAnalysis.max.toString(16).toUpperCase()}</span>
                          <span>Unique: {byteAnalysis.uniqueValuesCount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Surrounding Correlated Messages Analysis */}
            {inspectorTab === 'correlations' && (
              <div className="space-y-4">
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 flex items-center space-x-1.5">
                      <GitMerge className="w-4 h-4 text-blue-400" />
                      <span>Surrounding Correlated Messages</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      @ +{selectedFrame.timestamp.toFixed(3)}s
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Much like SavvyLens Bookmarks, this scans traffic in a temporal window around this frame to uncover synchronous causes and effects.
                  </p>

                  {/* Window Size Selector */}
                  <div className="flex items-center space-x-1 pt-1">
                    <span className="text-[10px] text-slate-400 mr-1">Window:</span>
                    {[100, 250, 500, 1000].map(ms => (
                      <button
                        key={ms}
                        onClick={() => setCorrelationWindowMs(ms)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono font-medium border transition ${
                          correlationWindowMs === ms
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        ±{ms}ms
                      </button>
                    ))}
                  </div>
                </div>

                {/* List of Correlated Messages */}
                {correlatedEvents.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                    No surrounding messages found within ±{correlationWindowMs}ms of this frame.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {correlatedEvents.map(event => (
                      <div 
                        key={event.id}
                        className="bg-slate-950 p-3 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-blue-400 text-xs">
                              {event.id}
                            </span>
                            <span className="text-slate-300 text-xs font-medium">
                              {event.name || 'Unknown'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                              event.timeOffsetMs >= 0 
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' 
                                : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            }`}>
                              {event.timeOffsetMs >= 0 ? `+${event.timeOffsetMs}ms` : `${event.timeOffsetMs}ms`}
                            </span>

                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                              event.correlationStrength === 'High'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : event.correlationStrength === 'Medium'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {event.correlationStrength}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-300">
                          {event.reason}
                        </p>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-900">
                          <span className="text-[10px] text-slate-400 font-mono">
                            Payload: {event.sampleData.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                          </span>

                          <button
                            onClick={() => setSearchTerm(event.id)}
                            className="px-2 py-1 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded text-[10px] font-medium transition flex items-center space-x-1"
                            title="Filter Live Sniffer to this correlated CAN ID"
                          >
                            <Filter className="w-3 h-3" />
                            <span>Filter ID</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bookmark Action */}
                {onBookmarkFromFrame && (
                  <button
                    onClick={() => onBookmarkFromFrame(selectedFrame, correlatedEvents.map(e => e.id))}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition shadow-sm flex items-center justify-center space-x-2 text-xs"
                  >
                    <BookmarkIcon className="w-3.5 h-3.5" />
                    <span>Bookmark Event @ +{selectedFrame.timestamp.toFixed(2)}s ({correlatedEvents.length} Correlated IDs)</span>
                  </button>
                )}
              </div>
            )}

            {/* Bottom Send Action */}
            <button
              onClick={() => onSendCustomFrame(selectedFrame.id, selectedFrame.data)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium rounded-xl transition border border-slate-700 text-xs"
            >
              Resend Frame ({selectedFrame.id})
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
