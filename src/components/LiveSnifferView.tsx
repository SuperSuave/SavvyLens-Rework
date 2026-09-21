import React, { useState, useMemo } from 'react';
import { 
  Search, Trash2, Filter, ArrowUpRight, ArrowDownLeft, 
  Shield, Eye, Zap, Bookmark as BookmarkIcon, Sparkles, SlidersHorizontal, 
  BrainCircuit, GitMerge, Clock, Activity, Info, ListFilter, Check, X,
  Radio, Gauge, Hash, RefreshCw, History, ChevronLeft, ChevronRight,
  Pause, Play, Table as TableIcon, Layers, ArrowRight, Maximize2, Minimize2
} from 'lucide-react';
import { CANFrame, DBCMessage, CANMessageTrigger } from '../types';
import { 
  analyzeFrameSignals, 
  analyzeSurroundingCorrelations, 
  FrameSignalAnalysis, 
  CorrelatedEvent,
  InferredSignalType 
} from '../utils/signalAnalysis';
import { ValueCorrelationModal } from './ValueCorrelationModal';
import { describeBitDifference } from '../utils/baselineAnalysis';

export interface MessageStateItem {
  frame: CANFrame;
  relativeOffset: number; // -5 to +5
  deltaMs: number; // relative to selectedFrame
  changedBytesFromSelected: boolean[];
  changedBitsFromSelected: number[];
  changedBytesFromPrior: boolean[];
}

export interface MessageStateHistory {
  prevStates: MessageStateItem[];
  currentState: MessageStateItem | null;
  nextStates: MessageStateItem[];
  totalOccurrences: number;
  currentIndex: number;
  allIdFrames: CANFrame[];
}

interface LiveSnifferViewProps {
  frames: CANFrame[];
  onClearFrames: () => void;
  dbcMessages: DBCMessage[];
  onSendCustomFrame: (id: string, data: number[]) => void;
  onQuickBookmark?: () => void;
  onBookmarkFromFrame?: (frame: CANFrame, correlatedIds: string[]) => void;
  onAddCanTrigger?: (trigger: CANMessageTrigger) => void;
  initialSearchTerm?: string;
  isCapturing?: boolean;
  onToggleCapture?: () => void;
}

type FilterMode = 'all' | 'changed' | 'diverged' | 'new_ids' | 'rx' | 'tx';
type InspectorTab = 'states' | 'matrix' | 'signal_types' | 'correlations';

export const LiveSnifferView: React.FC<LiveSnifferViewProps> = ({
  frames,
  onClearFrames,
  dbcMessages,
  onSendCustomFrame,
  onQuickBookmark,
  onBookmarkFromFrame,
  onAddCanTrigger,
  initialSearchTerm = '',
  isCapturing = true,
  onToggleCapture
}) => {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [highlightChanges, setHighlightChanges] = useState(true);
  const [selectedFrame, setSelectedFrame] = useState<CANFrame | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('states');
  const [stateViewMode, setStateViewMode] = useState<'timeline' | 'table'>('timeline');
  const [isInspectorExpanded, setIsInspectorExpanded] = useState(false);
  const [correlationWindowMs, setCorrelationWindowMs] = useState<number>(500);
  const [isMappingTrigger, setIsMappingTrigger] = useState(false);
  const [mapByteChoice, setMapByteChoice] = useState<number>(1); // D1 - D8
  const [mapTriggerName, setMapTriggerName] = useState('');

  // SavvyLens Baseline & Latched Pulse Detection State
  const [baselineActive, setBaselineActive] = useState<boolean>(false);
  const [baselineMap, setBaselineMap] = useState<Map<string, { baselineData: number[]; varianceMask: number[] }>>(new Map());
  const [latchedPulses, setLatchedPulses] = useState<Map<string, {
    canId: string;
    byteIndex: number;
    baselineVal: number;
    peakVal: number;
    currentVal: number;
    timestamp: number;
    bitMask: number;
  }>>(new Map());
  const [latchDurationSec, setLatchDurationSec] = useState<number>(10); // 10s default

  // Value Correlation Modal State
  const [correlatorOpen, setCorrelatorOpen] = useState<boolean>(false);
  const [correlatorFrame, setCorrelatorFrame] = useState<CANFrame | null>(null);
  const [correlatorByteIdx, setCorrelatorByteIdx] = useState<number>(0);

  // Capture current frames as baseline
  const handleCaptureBaseline = () => {
    const map = new Map<string, { baselineData: number[]; varianceMask: number[] }>();
    frames.forEach(f => {
      const existing = map.get(f.id);
      if (!existing) {
        map.set(f.id, {
          baselineData: [...f.data],
          varianceMask: new Array(f.data.length).fill(0)
        });
      } else {
        f.data.forEach((b, idx) => {
          existing.varianceMask[idx] = existing.varianceMask[idx] | (existing.baselineData[idx] ^ b);
        });
      }
    });
    setBaselineMap(map);
    setBaselineActive(true);
    setLatchedPulses(new Map());
  };

  const handleClearBaseline = () => {
    setBaselineActive(false);
    setBaselineMap(new Map());
    setLatchedPulses(new Map());
  };

  // E-GMP Test Workflow 1: Simulate Steering Wheel Button Pulse (00 -> 40 -> 00)
  const handleSimulateEgmpButtonPulse = () => {
    // Step 1: Active button press (Byte D4 = 0x40)
    onSendCustomFrame("0x180", [0x10, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x0F]);
    // Step 2: Released 150ms later (Byte D4 returns to 0x00)
    setTimeout(() => {
      onSendCustomFrame("0x180", [0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10]);
    }, 150);
  };

  // E-GMP Test Workflow 2: Simulate HVAC Command (06/06) & State Echo (06)
  const handleSimulateEgmpHvacCommand = () => {
    // Command on 0x320 with Byte D4/D5 = 0x06
    onSendCustomFrame("0x320", [0x01, 0x00, 0x00, 0x06, 0x06, 0x00, 0x00, 0x22]);
    // State update on 0x485 with Byte D2 = 0x06 arriving 45ms later
    setTimeout(() => {
      onSendCustomFrame("0x485", [0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05]);
    }, 45);
  };

  // Live Pulse Tracking when Baseline is Active
  React.useEffect(() => {
    if (!baselineActive || frames.length === 0) return;
    const latestFrame = frames[frames.length - 1];
    if (!latestFrame) return;

    const base = baselineMap.get(latestFrame.id);
    if (!base) return;

    const now = Date.now();

    latestFrame.data.forEach((b, idx) => {
      const baseVal = base.baselineData[idx] ?? 0;
      const mask = base.varianceMask[idx] ?? 0;
      // Skip cycling alive counter bits
      const isPureCounter = (mask & 0x0F) === 0x0F && (mask & 0xF0) === 0;
      const isDiff = isPureCounter ? (b & 0xF0) !== (baseVal & 0xF0) : b !== baseVal;

      const pulseKey = `${latestFrame.id}_D${idx}`;

      if (isDiff) {
        setLatchedPulses(prev => {
          const next = new Map(prev);
          const existing = next.get(pulseKey);
          const peakVal = existing ? (Math.abs(b - baseVal) > Math.abs(existing.peakVal - baseVal) ? b : existing.peakVal) : b;
          next.set(pulseKey, {
            canId: latestFrame.id,
            byteIndex: idx,
            baselineVal: baseVal,
            peakVal,
            currentVal: b,
            timestamp: now,
            bitMask: peakVal ^ baseVal
          });
          return next;
        });
      } else {
        // Returned to baseline value
        setLatchedPulses(prev => {
          const existing = prev.get(pulseKey);
          if (existing && existing.currentVal !== baseVal) {
            const next = new Map(prev);
            next.set(pulseKey, {
              ...existing,
              currentVal: baseVal,
              timestamp: now
            });
            return next;
          }
          return prev;
        });
      }
    });

    // Cleanup expired pulses if latch duration is set
    if (latchDurationSec > 0) {
      setLatchedPulses(prev => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((p, key) => {
          if (now - p.timestamp > latchDurationSec * 1000) {
            next.delete(key);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [frames, baselineActive, baselineMap, latchDurationSec]);

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
      } else if (filterMode === 'diverged') {
        const hasPulse = Array.from(latchedPulses.values()).some(p => p.canId.toLowerCase() === frame.id.toLowerCase());
        const base = baselineMap.get(frame.id);
        const isDiverged = base && frame.data.some((b, idx) => {
          const m = base.varianceMask[idx] ?? 0;
          if ((m & 0x0F) === 0x0F && (m & 0xF0) === 0) {
            return (b & 0xF0) !== (base.baselineData[idx] & 0xF0);
          }
          return b !== base.baselineData[idx];
        });
        if (!hasPulse && !isDiverged) return false;
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

  // SavvyLens Previous 5 and Next 5 States Computation
  const messageStates = useMemo<MessageStateHistory | null>(() => {
    if (!selectedFrame) return null;

    const allIdFrames = frames.filter(f => f.id.toLowerCase() === selectedFrame.id.toLowerCase());
    if (allIdFrames.length === 0) return null;

    let currIdx = allIdFrames.findIndex(f => f === selectedFrame);
    if (currIdx === -1) {
      currIdx = allIdFrames.findIndex(f => 
        Math.abs(f.timestamp - selectedFrame.timestamp) < 0.0001 && f.count === selectedFrame.count
      );
    }
    if (currIdx === -1) {
      let minDiff = Infinity;
      let closestIdx = 0;
      allIdFrames.forEach((f, idx) => {
        const diff = Math.abs(f.timestamp - selectedFrame.timestamp);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = idx;
        }
      });
      currIdx = closestIdx;
    }

    const currentFrameObj = allIdFrames[currIdx];

    const buildItem = (frame: CANFrame, relOffset: number, priorFrame?: CANFrame): MessageStateItem => {
      const deltaMs = Number(((frame.timestamp - currentFrameObj.timestamp) * 1000).toFixed(1));
      const changedBytesFromSelected = frame.data.map((b, i) => b !== (currentFrameObj.data[i] ?? 0));
      const changedBitsFromSelected = frame.data.map((b, i) => (b ^ (currentFrameObj.data[i] ?? 0)) & 0xFF);
      const changedBytesFromPrior = priorFrame
        ? frame.data.map((b, i) => b !== (priorFrame.data[i] ?? 0))
        : frame.data.map(() => false);

      return {
        frame,
        relativeOffset: relOffset,
        deltaMs,
        changedBytesFromSelected,
        changedBitsFromSelected,
        changedBytesFromPrior
      };
    };

    // Up to 5 previous frames
    const startPrev = Math.max(0, currIdx - 5);
    const rawPrev = allIdFrames.slice(startPrev, currIdx);
    const prevStates: MessageStateItem[] = rawPrev.map((f, i) => {
      const offset = -(rawPrev.length - i);
      const prior = i > 0 ? rawPrev[i - 1] : (startPrev > 0 ? allIdFrames[startPrev - 1] : undefined);
      return buildItem(f, offset, prior);
    });

    // Current state (offset 0)
    const priorToCurrent = currIdx > 0 ? allIdFrames[currIdx - 1] : undefined;
    const currentState = buildItem(currentFrameObj, 0, priorToCurrent);

    // Up to 5 next frames
    const rawNext = allIdFrames.slice(currIdx + 1, currIdx + 6);
    const nextStates: MessageStateItem[] = rawNext.map((f, i) => {
      const offset = i + 1;
      const prior = i === 0 ? currentFrameObj : rawNext[i - 1];
      return buildItem(f, offset, prior);
    });

    return {
      prevStates,
      currentState,
      nextStates,
      totalOccurrences: allIdFrames.length,
      currentIndex: currIdx,
      allIdFrames
    };
  }, [selectedFrame, frames]);

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
              onClick={() => setFilterMode('diverged')}
              title="SavvyLens: Show only CAN IDs with active pulses or baseline divergence"
              className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition ${
                filterMode === 'diverged' 
                  ? 'bg-rose-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Pulses / Diverged</span>
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

        {/* Baseline Latch & E-GMP Simulation Bar */}
        <div className="px-3 py-2 bg-slate-950/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-semibold flex items-center space-x-1">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span>Baseline Latch:</span>
            </span>

            {!baselineActive ? (
              <button
                onClick={handleCaptureBaseline}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center space-x-1.5 shadow-xs transition"
                title="Lock current frame payloads as steady-state baseline and latch momentary pulses"
              >
                <Zap className="w-3 h-3 text-amber-300" />
                <span>Capture Baseline</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Locked ({baselineMap.size} IDs)</span>
                </span>
                <button
                  onClick={handleClearBaseline}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Latch Duration Selector */}
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg text-slate-300 font-mono text-[11px]">
              <span className="text-slate-500 font-sans">Hold:</span>
              <select
                value={latchDurationSec}
                onChange={e => setLatchDurationSec(Number(e.target.value))}
                className="bg-transparent text-white focus:outline-hidden cursor-pointer"
              >
                <option value={5} className="bg-slate-900">5s</option>
                <option value={10} className="bg-slate-900">10s</option>
                <option value={30} className="bg-slate-900">30s</option>
                <option value={0} className="bg-slate-900">Infinite</option>
              </select>
            </div>

            {latchedPulses.size > 0 && (
              <span className="text-amber-400 font-bold bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded text-[11px] font-mono">
                {latchedPulses.size} Latched Pulse{latchedPulses.size > 1 ? 's' : ''} (Click byte to correlate)
              </span>
            )}
          </div>

          {/* Quick Simulation Triggers for User Workflows */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-500 font-medium">E-GMP Test Injections:</span>
            <button
              onClick={handleSimulateEgmpButtonPulse}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/60 text-amber-300 rounded-lg font-mono text-[11px] transition flex items-center space-x-1"
              title="Inject 0x180 Byte D4: 00 -> 40 -> 00 (Momentary steering button pulse)"
            >
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Simulate Pulse (00➔40➔00)</span>
            </button>

            <button
              onClick={handleSimulateEgmpHvacCommand}
              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/60 text-blue-300 rounded-lg font-mono text-[11px] transition flex items-center space-x-1"
              title="Inject 0x320 Cmd (06/06) & 0x485 State (06) echo 45ms later"
            >
              <GitMerge className="w-3 h-3 text-blue-400" />
              <span>Simulate HVAC (Cmd➔Echo)</span>
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
                <th className="py-2.5 px-3 font-medium">Data Bytes (D1–D8)</th>
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

                      {/* SavvyLens Byte D1-D8 & Bit Change Highlighting & Latched Pulses */}
                      <td className="py-2 px-3 tracking-wider">
                        <div className="flex items-center space-x-1.5 font-mono">
                          {frame.data.map((byte, bIdx) => {
                            const isChanged = highlightChanges && frame.changedBytes?.[bIdx];
                            const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
                            const pulse = latchedPulses.get(`${frame.id}_D${bIdx}`);
                            const base = baselineMap.get(frame.id);
                            const baseVal = base?.baselineData[bIdx];
                            const isDeviating = baselineActive && baseVal !== undefined && baseVal !== byte;

                            return (
                              <div
                                key={bIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCorrelatorFrame(frame);
                                  setCorrelatorByteIdx(bIdx);
                                  setCorrelatorOpen(true);
                                }}
                                title={
                                  pulse 
                                    ? `Latched Pulse: Base 0x${pulse.baselineVal.toString(16).padStart(2, '0')} ➔ Peak 0x${pulse.peakVal.toString(16).padStart(2, '0')} ➔ Cur 0x${pulse.currentVal.toString(16).padStart(2, '0')} (${describeBitDifference(pulse.baselineVal, pulse.peakVal)})\nClick to correlate with state echo`
                                    : isChanged 
                                    ? `Byte D${bIdx + 1} changed! Prev: 0x${(frame.prevData?.[bIdx] ?? byte).toString(16).toUpperCase().padStart(2, '0')}\nClick to find command/state echoes` 
                                    : `Byte D${bIdx + 1}: 0x${hexStr}\nClick to find command/state echoes`
                                }
                                className={`px-1.5 py-0.5 rounded transition inline-flex flex-col items-center cursor-pointer relative group ${
                                  pulse
                                    ? 'bg-amber-500/30 text-amber-200 font-bold border border-amber-500/80 shadow-xs ring-1 ring-amber-500/40'
                                    : isDeviating
                                    ? 'bg-rose-500/25 text-rose-200 font-bold border border-rose-500/50'
                                    : isChanged
                                    ? 'bg-amber-500/25 text-amber-300 font-bold border border-amber-500/40 shadow-xs'
                                    : 'text-slate-300 bg-slate-950/40 border border-slate-800/40 hover:border-blue-500/50 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center space-x-1">
                                  <span className="text-[8px] text-slate-500 font-sans leading-none pb-0.5 select-none">D{bIdx + 1}</span>
                                  {pulse && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
                                  )}
                                </div>
                                <span className="leading-none text-[11px]">{hexStr}</span>
                                {pulse && (
                                  <span className="text-[8px] text-amber-300 font-bold leading-none mt-0.5">
                                    Δ{pulse.peakVal.toString(16).toUpperCase().padStart(2, '0')}
                                  </span>
                                )}
                              </div>
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
        <div className={`${isInspectorExpanded ? 'w-[640px] xl:w-[720px]' : 'w-[480px] xl:w-[520px]'} bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden select-none transition-all duration-150`}>
          {/* Top Panel Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Eye className="w-4 h-4 text-blue-400" />
              <div>
                <h3 className="font-bold text-sm text-white">SavvyLens Inspector</h3>
                <span className="text-[11px] font-mono text-blue-400">{selectedFrame.id} @ +{selectedFrame.timestamp.toFixed(3)}s</span>
              </div>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setIsInspectorExpanded(!isInspectorExpanded)}
                title={isInspectorExpanded ? 'Collapse inspector width' : 'Expand inspector width'}
                className="text-slate-400 hover:text-white p-1 rounded bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              >
                {isInspectorExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={() => setSelectedFrame(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>

          {/* Occurrence Stepper & Quick Nav for this CAN ID */}
          {messageStates && (
            <div className="px-3.5 py-2 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={() => {
                    if (messageStates.currentIndex > 0) {
                      setSelectedFrame(messageStates.allIdFrames[messageStates.currentIndex - 1]);
                    }
                  }}
                  disabled={messageStates.currentIndex <= 0}
                  title="Jump to previous occurrence (-1)"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="text-[11px] font-mono whitespace-nowrap">
                  <span className="text-slate-400">State: </span>
                  <span className="text-blue-400 font-bold">{messageStates.currentIndex + 1}</span>
                  <span className="text-slate-500"> / {messageStates.totalOccurrences}</span>
                </div>

                <button
                  onClick={() => {
                    if (messageStates.currentIndex < messageStates.totalOccurrences - 1) {
                      setSelectedFrame(messageStates.allIdFrames[messageStates.currentIndex + 1]);
                    }
                  }}
                  disabled={messageStates.currentIndex >= messageStates.totalOccurrences - 1}
                  title="Jump to next occurrence (+1)"
                  className="p-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mini State Quick Jump Chips */}
              <div className="flex items-center space-x-1 font-mono text-[9px] overflow-x-auto py-0.5">
                {messageStates.prevStates.map(s => (
                  <button
                    key={s.relativeOffset}
                    onClick={() => setSelectedFrame(s.frame)}
                    title={`Jump to state ${s.relativeOffset} (${s.deltaMs}ms)`}
                    className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 cursor-pointer transition"
                  >
                    {s.relativeOffset}
                  </button>
                ))}
                <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold shadow-xs">
                  0
                </span>
                {messageStates.nextStates.map(s => (
                  <button
                    key={s.relativeOffset}
                    onClick={() => setSelectedFrame(s.frame)}
                    title={`Jump to state +${s.relativeOffset} (+${s.deltaMs}ms)`}
                    className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 cursor-pointer transition"
                  >
                    +{s.relativeOffset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 p-1 text-xs gap-1">
            <button
              onClick={() => setInspectorTab('states')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1 transition cursor-pointer ${
                inspectorTab === 'states' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>±5 States</span>
              {messageStates && (
                <span className="text-[10px] bg-blue-500/20 text-blue-200 px-1 py-0.2 rounded font-mono">
                  {messageStates.prevStates.length}+{messageStates.nextStates.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setInspectorTab('matrix')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1 transition cursor-pointer ${
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
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1 transition cursor-pointer ${
                inspectorTab === 'signal_types' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>Signals</span>
            </button>

            <button
              onClick={() => setInspectorTab('correlations')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium flex items-center justify-center space-x-1 transition cursor-pointer ${
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

            {/* Quick Action Bar for Selected Frame */}
            <div className="flex items-center space-x-2">
              {onQuickBookmark && (
                <button
                  onClick={onQuickBookmark}
                  className="flex-1 py-1.5 px-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer"
                >
                  <BookmarkIcon className="w-3.5 h-3.5" />
                  <span>Bookmark [B]</span>
                </button>
              )}
              {onAddCanTrigger && (
                <button
                  onClick={() => {
                    setIsMappingTrigger(!isMappingTrigger);
                    if (!mapTriggerName) {
                      setMapTriggerName(`${selectedFrame.name || selectedFrame.id} Sync Trigger`);
                    }
                  }}
                  className="flex-1 py-1.5 px-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isMappingTrigger ? 'Close Map' : 'Map to Trigger'}</span>
                </button>
              )}
            </div>

            {/* Inline CAN Message Trigger Mapper */}
            {isMappingTrigger && onAddCanTrigger && (
              <div className="bg-slate-950 p-3 rounded-xl border border-indigo-500/40 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between text-indigo-300 font-bold text-xs pb-1 border-b border-slate-800">
                  <span>Map {selectedFrame.id} as Bookmark Trigger</span>
                  <span className="text-[10px] text-slate-400">D1–D8</span>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Trigger Name</label>
                  <input
                    type="text"
                    value={mapTriggerName}
                    onChange={e => setMapTriggerName(e.target.value)}
                    placeholder="e.g. Steering Wheel Button"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Target Byte (D1–D8)</label>
                    <select
                      value={mapByteChoice}
                      onChange={e => setMapByteChoice(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(n => {
                        const bVal = selectedFrame.data[n - 1];
                        const hexVal = bVal !== undefined ? ` (0x${bVal.toString(16).toUpperCase().padStart(2, '0')})` : '';
                        return (
                          <option key={n} value={n}>Byte D{n}{hexVal}</option>
                        );
                      })}
                      <option value={0}>Any Byte (Any on {selectedFrame.id})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Current Byte Hex</label>
                    <div className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono text-amber-300 font-bold">
                      0x{(selectedFrame.data[mapByteChoice === 0 ? 0 : mapByteChoice - 1] ?? 0).toString(16).toUpperCase().padStart(2, '0')}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    const chosenByteVal = mapByteChoice === 0 
                      ? 0 
                      : (selectedFrame.data[mapByteChoice - 1] ?? 0);
                    const hexStr = `0x${chosenByteVal.toString(16).toUpperCase().padStart(2, '0')}`;
                    
                    onAddCanTrigger({
                      id: 'trig-' + Date.now(),
                      name: mapTriggerName.trim() || `${selectedFrame.id} Byte D${mapByteChoice} Trigger`,
                      enabled: true,
                      canId: selectedFrame.id,
                      targetByte: mapByteChoice,
                      condition: mapByteChoice === 0 ? 'any_message' : 'equals',
                      expectedHex: hexStr,
                      maskHex: '0xFF',
                      autoDisableOnTrigger: false,
                      cooldownMs: 800,
                      notes: `Auto-mapped from Live Sniffer: ${selectedFrame.id} on Byte ${mapByteChoice === 0 ? 'Any' : `D${mapByteChoice}`} == ${hexStr}`
                    });
                    setIsMappingTrigger(false);
                  }}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
                >
                  Save Trigger (Byte D{mapByteChoice === 0 ? 'Any' : mapByteChoice})
                </button>
              </div>
            )}

            {/* TAB 0: Previous 5 States & Next 5 States */}
            {inspectorTab === 'states' && messageStates && (
              <div className="space-y-4">
                {/* Recording Status & Freeze Buffer Action */}
                {isCapturing ? (
                  <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-amber-300 font-semibold text-xs">
                        <Radio className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                        <span>Live Recording In Progress</span>
                      </div>
                      {onToggleCapture && (
                        <button
                          onClick={onToggleCapture}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition shadow-xs"
                        >
                          <Pause className="w-3 h-3" />
                          <span>Pause to Freeze</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Showing previous 5 states from live buffer. Next 5 states require paused playback or frames that arrive subsequent to this message.
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-slate-300 font-semibold text-xs">
                      <Pause className="w-3.5 h-3.5 text-slate-400" />
                      <span>Recording Paused (Frozen Buffer)</span>
                    </div>
                    {onToggleCapture && (
                      <button
                        onClick={onToggleCapture}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition shadow-xs"
                      >
                        <Play className="w-3 h-3" />
                        <span>Resume Live</span>
                      </button>
                    )}
                  </div>
                )}

                {/* View Mode Toggle Header */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 flex items-center space-x-1.5">
                      <History className="w-3.5 h-3.5 text-blue-400" />
                      <span>State Transitions (±5 States)</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      CAN ID {selectedFrame.id} • {messageStates.totalOccurrences} total instances
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                    <button
                      onClick={() => setStateViewMode('timeline')}
                      className={`px-2 py-0.5 rounded font-medium flex items-center space-x-1 transition cursor-pointer ${
                        stateViewMode === 'timeline'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Layers className="w-3 h-3" />
                      <span>Cards</span>
                    </button>
                    <button
                      onClick={() => setStateViewMode('table')}
                      className={`px-2 py-0.5 rounded font-medium flex items-center space-x-1 transition cursor-pointer ${
                        stateViewMode === 'table'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <TableIcon className="w-3 h-3" />
                      <span>Diff Table</span>
                    </button>
                  </div>
                </div>

                {/* MODE 1: Vertical Timeline View */}
                {stateViewMode === 'timeline' && (
                  <div className="space-y-3">
                    {/* SECTION 1: Previous 5 States */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                          <span>Previous States</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({messageStates.prevStates.length} of 5 available)
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-400">Prior in Time</span>
                      </div>

                      {messageStates.prevStates.length === 0 ? (
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-center text-[11px]">
                          Initial state: No previous occurrences of {selectedFrame.id} in this session.
                        </div>
                      ) : (
                        messageStates.prevStates.map((stateItem) => (
                          <div
                            key={stateItem.relativeOffset}
                            className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                                  State {stateItem.relativeOffset}
                                </span>
                                <span className="font-mono text-slate-400 text-[11px]">
                                  +{stateItem.frame.timestamp.toFixed(4)}s
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-amber-400 font-semibold text-[10px]">
                                  {stateItem.deltaMs} ms
                                </span>
                                <button
                                  onClick={() => setSelectedFrame(stateItem.frame)}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold hover:underline flex items-center space-x-0.5 cursor-pointer"
                                >
                                  <span>Inspect</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>

                            {/* D1-D8 Byte Visualizer with Difference Highlighting */}
                            <div className="flex items-center space-x-1 font-mono">
                              {stateItem.frame.data.map((byte, bIdx) => {
                                const differs = stateItem.changedBytesFromSelected[bIdx];
                                const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
                                return (
                                  <div
                                    key={bIdx}
                                    title={`Byte D${bIdx + 1}: 0x${hexStr}${differs ? ` (Differs from selected: 0x${(selectedFrame.data[bIdx] ?? 0).toString(16).toUpperCase().padStart(2, '0')})` : ''}`}
                                    className={`flex-1 py-1 rounded text-center text-[11px] font-medium border ${
                                      differs
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    <span className="block text-[7px] text-slate-500 leading-none pb-0.5">D{bIdx + 1}</span>
                                    <span className="leading-none">{hexStr}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* SECTION 2: Current Selected State (Anchor) */}
                    <div className="bg-blue-950/30 border-2 border-blue-500 rounded-xl p-3 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] shadow-xs">
                            Selected State [0] (Active Anchor)
                          </span>
                          <span className="font-mono font-bold text-white text-xs">
                            +{selectedFrame.timestamp.toFixed(4)}s
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-blue-300">
                          Ref Delta: 0.0 ms
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 font-mono">
                        {selectedFrame.data.map((byte, bIdx) => {
                          const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
                          return (
                            <div
                              key={bIdx}
                              className="flex-1 py-1 rounded text-center text-[11px] font-bold bg-blue-900/50 text-blue-200 border border-blue-400/50"
                            >
                              <span className="block text-[7px] text-blue-300/80 leading-none pb-0.5">D{bIdx + 1}</span>
                              <span className="leading-none">{hexStr}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono pt-1 border-t border-blue-900/40">
                        <span>ASCII: &quot;{selectedFrame.ascii}&quot;</span>
                        <span>Occurrence: #{messageStates.currentIndex + 1} of {messageStates.totalOccurrences}</span>
                      </div>
                    </div>

                    {/* SECTION 3: Next 5 States */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                          <span>Next States</span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({messageStates.nextStates.length} of 5 available)
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-400">Subsequent in Time</span>
                      </div>

                      {messageStates.nextStates.length > 0 && (
                        messageStates.nextStates.map((stateItem) => (
                          <div
                            key={stateItem.relativeOffset}
                            className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                                  State +{stateItem.relativeOffset}
                                </span>
                                <span className="font-mono text-slate-400 text-[11px]">
                                  +{stateItem.frame.timestamp.toFixed(4)}s
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono text-emerald-400 font-semibold text-[10px]">
                                  +{stateItem.deltaMs} ms
                                </span>
                                <button
                                  onClick={() => setSelectedFrame(stateItem.frame)}
                                  className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold hover:underline flex items-center space-x-0.5 cursor-pointer"
                                >
                                  <span>Inspect</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>

                            {/* D1-D8 Byte Visualizer */}
                            <div className="flex items-center space-x-1 font-mono">
                              {stateItem.frame.data.map((byte, bIdx) => {
                                const differs = stateItem.changedBytesFromSelected[bIdx];
                                const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
                                return (
                                  <div
                                    key={bIdx}
                                    title={`Byte D${bIdx + 1}: 0x${hexStr}${differs ? ` (Differs from selected: 0x${(selectedFrame.data[bIdx] ?? 0).toString(16).toUpperCase().padStart(2, '0')})` : ''}`}
                                    className={`flex-1 py-1 rounded text-center text-[11px] font-medium border ${
                                      differs
                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    <span className="block text-[7px] text-slate-500 leading-none pb-0.5">D{bIdx + 1}</span>
                                    <span className="leading-none">{hexStr}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}

                      {messageStates.nextStates.length < 5 && (
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-slate-400 text-[11px] space-y-1">
                          {isCapturing ? (
                            <div className="flex items-start space-x-2">
                              <Radio className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                              <div>
                                <span className="font-semibold text-slate-200">Recording at live head:</span>{' '}
                                Subsequent states (+{messageStates.nextStates.length + 1} to +5) will append as new {selectedFrame.id} frames arrive. Pause recording to freeze and inspect historical logs.
                              </div>
                            </div>
                          ) : (
                            <div className="text-slate-500 text-center">
                              End of session reached: No further occurrences of {selectedFrame.id} recorded in this session.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* MODE 2: High-Density Matrix Diff Table View */}
                {stateViewMode === 'table' && (
                  <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto">
                    <table className="w-full text-left font-mono text-[10px]">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                          <th className="py-2 px-2">State</th>
                          <th className="py-2 px-2">Delta</th>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <th key={n} className="py-2 px-1 text-center">D{n}</th>
                          ))}
                          <th className="py-2 px-2">ASCII</th>
                          <th className="py-2 px-1 text-right">Jump</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {[...messageStates.prevStates, messageStates.currentState!, ...messageStates.nextStates].map((item) => {
                          const isCurrent = item.relativeOffset === 0;
                          return (
                            <tr
                              key={item.relativeOffset}
                              className={`transition ${
                                isCurrent
                                  ? 'bg-blue-950/40 text-white font-bold'
                                  : 'hover:bg-slate-900/80 text-slate-300'
                              }`}
                            >
                              <td className="py-1.5 px-2 font-bold whitespace-nowrap">
                                {isCurrent ? (
                                  <span className="text-blue-400 font-extrabold">[0] Current</span>
                                ) : item.relativeOffset > 0 ? (
                                  <span className="text-emerald-400">+{item.relativeOffset}</span>
                                ) : (
                                  <span className="text-slate-400">{item.relativeOffset}</span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 whitespace-nowrap text-slate-400">
                                {item.relativeOffset === 0 ? '0.0 ms' : `${item.deltaMs > 0 ? '+' : ''}${item.deltaMs} ms`}
                              </td>
                              {item.frame.data.map((b, bIdx) => {
                                const differs = !isCurrent && item.changedBytesFromSelected[bIdx];
                                return (
                                  <td
                                    key={bIdx}
                                    className={`py-1.5 px-1 text-center font-mono ${
                                      differs
                                        ? 'bg-amber-500/20 text-amber-300 font-bold'
                                        : isCurrent
                                        ? 'text-blue-200'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {b.toString(16).toUpperCase().padStart(2, '0')}
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-2 text-slate-400 whitespace-nowrap">
                                {item.frame.ascii}
                              </td>
                              <td className="py-1.5 px-1 text-right">
                                {isCurrent ? (
                                  <span className="text-[9px] text-blue-400 font-semibold">Active</span>
                                ) : (
                                  <button
                                    onClick={() => setSelectedFrame(item.frame)}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-blue-400 hover:text-blue-300 border border-slate-800 text-[9px] cursor-pointer"
                                  >
                                    Jump
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

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
                            <span>Byte D{bIdx + 1} (0x{byte.toString(16).toUpperCase().padStart(2, '0')})</span>
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
                              Byte D{byteAnalysis.byteIndex + 1}
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

      {/* Value Echo & Command ↔ State Correlation Modal */}
      {correlatorFrame && (
        <ValueCorrelationModal
          isOpen={correlatorOpen}
          onClose={() => setCorrelatorOpen(false)}
          commandFrame={correlatorFrame}
          commandByteIdx={correlatorByteIdx}
          allFrames={frames}
        />
      )}
    </div>
  );
};
