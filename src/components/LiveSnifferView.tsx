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

export interface SnifferIdRow {
  id: string;
  decimalId: number;
  name?: string;
  bus: number;
  dlc: number;
  data: number[];
  prevData?: number[];
  changedBytes: boolean[];
  changedBits: number[];
  byteDeltas: number[]; // 1 = increased (green), -1 = decreased (red), 0 = unchanged
  timestamp: number;
  lastDeltaSec: number;
  periodMs: number;
  freqHz: number;
  count: number;
  ascii: string;
  isNewId?: boolean;
  frame: CANFrame;
}

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

// Splits queries separated by commas or spaces, honoring quotes and handling byte syntax like D1:24 or D1=24
export function parseSearchTokens(query: string): string[] {
  if (!query || !query.trim()) return [];
  // Normalize colons and equals with whitespace e.g. "D1: 24" -> "D1:24", "d1 = 0x24" -> "d1:0x24"
  const normalized = query.trim().replace(/([a-zA-Z0-9]+)\s*[:=]\s*/g, '$1:');

  // Split on comma or whitespace, while supporting quotes
  const matches = normalized.match(/"([^"]+)"|'([^']+)'|([^,\s]+)/g);
  if (!matches) return [];

  return matches
    .map(m => m.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

// Matches target (CANFrame or SnifferIdRow) against parsed search tokens
export function matchSearchQuery(
  rawTokens: string[],
  target: {
    id: string;
    decimalId: number;
    name?: string;
    data: number[];
    ascii: string;
  }
): boolean {
  if (rawTokens.length === 0) return true;

  // Frame matches if ANY token matches (OR behavior for multiple searches)
  return rawTokens.some(token => {
    const t = token.toLowerCase();

    // Support compound search using '+' (e.g. 0x180+D1:40)
    if (t.includes('+')) {
      const subTokens = t.split('+').filter(Boolean);
      return subTokens.every(sub => matchSingleSearchToken(sub, target));
    }

    return matchSingleSearchToken(t, target);
  });
}

function matchSingleSearchToken(
  t: string,
  target: {
    id: string;
    decimalId: number;
    name?: string;
    data: number[];
    ascii: string;
  }
): boolean {
  if (!t) return true;

  // 1. D1 - D8 Byte Matcher (1-indexed: D1 is byte 0, D8 is byte 7)
  // Syntax: D1:24, d1:0x24, D1=24, d8:ff, D3:0, etc.
  const dMatch = t.match(/^d([1-8])[:=](?:0x)?([0-9a-f]{1,2})$/i);
  if (dMatch) {
    const byteIdx = parseInt(dMatch[1], 10) - 1;
    const expectedByte = parseInt(dMatch[2], 16);
    return target.data[byteIdx] === expectedByte;
  }

  // Also support legacy b0 - b7 (0-indexed: b0 is byte 0, b7 is byte 7)
  const bMatch = t.match(/^b([0-7])[:=](?:0x)?([0-9a-f]{1,2})$/i);
  if (bMatch) {
    const byteIdx = parseInt(bMatch[1], 10);
    const expectedByte = parseInt(bMatch[2], 16);
    return target.data[byteIdx] === expectedByte;
  }

  // 2. data: Hex Payload Pattern Search (e.g. data:dead, data:01 02)
  if (t.startsWith('data:')) {
    const hexPattern = t.slice(5).replace(/[\s:]+/g, '');
    const frameHex = target.data.map(b => b.toString(16).padStart(2, '0')).join('');
    return frameHex.includes(hexPattern);
  }

  // 3. id: Explicit ID Search (e.g. id:123 or id:0x123)
  if (t.startsWith('id:')) {
    const queryId = t.slice(3).replace(/^0x/, '');
    const normFrameId = target.id.toLowerCase().replace(/^0x/, '');
    return normFrameId.includes(queryId) || target.decimalId.toString().includes(queryId);
  }

  // 4. Standard Multi-field Search
  const normToken = t.replace(/^0x/, '');
  const normFrameId = target.id.toLowerCase().replace(/^0x/, '');
  const hexDataNoSpaces = target.data.map(b => b.toString(16).padStart(2, '0')).join('');
  const hexDataSpaced = target.data.map(b => b.toString(16).padStart(2, '0')).join(' ');

  return (
    normFrameId.includes(normToken) ||
    target.decimalId.toString().includes(t) ||
    (target.name && target.name.toLowerCase().includes(t)) ||
    hexDataNoSpaces.includes(t.replace(/\s+/g, '')) ||
    hexDataSpaced.includes(t) ||
    target.ascii.toLowerCase().includes(t)
  );
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
  playbackFrame?: CANFrame | null;
  isPlaybackActive?: boolean;
  playbackTime?: number;
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
  onToggleCapture,
  playbackFrame,
  isPlaybackActive = false,
  playbackTime
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

  // Performance Modes: 'trace' (Chronological virtualized stream - default) or 'sniffer' (Grouped by ID)
  const [viewMode, setViewMode] = useState<'trace' | 'sniffer'>('trace');
  const [snifferSortBy, setSnifferSortBy] = useState<'id' | 'period' | 'count' | 'activity'>('id');
  const [snifferSortAsc, setSnifferSortAsc] = useState<boolean>(true);

  // Trace Mode Sorting: Smart primary sort with secondary tie-breaker as original arrival order
  const [traceSortBy, setTraceSortBy] = useState<'time' | 'id' | 'bus' | 'dlc' | 'name' | 'period' | 'count'>('time');
  const [traceSortAsc, setTraceSortAsc] = useState<boolean>(true);
  const [notchedBitsMap, setNotchedBitsMap] = useState<Map<string, number[]>>(new Map());

  // Virtualization & container refs for both views
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const snifferContainerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [autoScroll, setAutoScroll] = useState(true);

  // Sync selected frame from playback scrubber
  React.useEffect(() => {
    if (playbackFrame) {
      if (!selectedFrame || selectedFrame.id !== playbackFrame.id || Math.abs(selectedFrame.timestamp - playbackFrame.timestamp) > 0.0001) {
        setSelectedFrame(playbackFrame);
      }
    }
  }, [playbackFrame, selectedFrame]);

  React.useEffect(() => {
    if (!tableContainerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setContainerHeight(entry.contentRect.height);
        }
      }
    });
    observer.observe(tableContainerRef.current);
    return () => observer.disconnect();
  }, []);

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

  // SavvyLens Multi-Search Tokenizer (Supports comma/space separated queries & D1-D8 bytes)
  const searchTokens = useMemo(() => parseSearchTokens(searchTerm), [searchTerm]);

  // SavvyLens Enhanced Search & Filtering Engine with Smart Secondary Trace Sort
  const filteredFrames = useMemo(() => {
    // 1. Tag frames with original arrival order index
    const indexed = frames.map((f, originalIndex) => ({ frame: f, originalIndex }));

    // 2. Filter by filterMode and multi-search query
    const filtered = indexed.filter(({ frame }) => {
      // Filter mode condition
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

      // Enhanced Multi-Search (comma/space separated, D1-D8 bytes, data hex, IDs)
      return matchSearchQuery(searchTokens, frame);
    });

    // 3. Smart Sorting for Trace Stream: Primary chosen metric + Secondary arrival order (never random)
    filtered.sort((a, b) => {
      let primaryDiff = 0;
      if (traceSortBy === 'time') {
        primaryDiff = a.frame.timestamp - b.frame.timestamp;
      } else if (traceSortBy === 'id') {
        primaryDiff = a.frame.decimalId - b.frame.decimalId;
      } else if (traceSortBy === 'bus') {
        primaryDiff = a.frame.bus - b.frame.bus;
      } else if (traceSortBy === 'dlc') {
        primaryDiff = a.frame.dlc - b.frame.dlc;
      } else if (traceSortBy === 'name') {
        primaryDiff = (a.frame.name || '').localeCompare(b.frame.name || '');
      } else if (traceSortBy === 'period') {
        primaryDiff = (a.frame.periodMs || 0) - (b.frame.periodMs || 0);
      } else if (traceSortBy === 'count') {
        primaryDiff = (a.frame.count || 0) - (b.frame.count || 0);
      }

      if (primaryDiff !== 0) {
        return traceSortAsc ? primaryDiff : -primaryDiff;
      }

      // Secondary sort is ALWAYS the exact arrival order (originalIndex)
      return a.originalIndex - b.originalIndex;
    });

    return filtered.map(item => item.frame);
  }, [frames, filterMode, searchTokens, traceSortBy, traceSortAsc, latchedPulses, baselineMap]);

  // SavvyLens Aggregated Sniffer Engine (Grouped by Unique CAN ID with Period, Frequency, and Delta tracking)
  const aggregatedSnifferRows = useMemo<SnifferIdRow[]>(() => {
    const map = new Map<string, SnifferIdRow>();
    const currentTime = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const existing = map.get(f.id);
      if (!existing) {
        map.set(f.id, {
          id: f.id,
          decimalId: f.decimalId,
          name: f.name,
          bus: f.bus,
          dlc: f.dlc,
          data: f.data,
          prevData: f.prevData,
          changedBytes: f.changedBytes || f.data.map(() => false),
          changedBits: f.changedBits || f.data.map(() => 0),
          byteDeltas: f.data.map(() => 0),
          timestamp: f.timestamp,
          lastDeltaSec: 0,
          periodMs: f.periodMs || 0,
          freqHz: f.periodMs && f.periodMs > 0 ? Math.round(1000 / f.periodMs) : 0,
          count: f.count || 1,
          ascii: f.ascii,
          isNewId: f.isNewId,
          frame: f
        });
      } else {
        const deltaSec = f.timestamp - existing.timestamp;
        const periodMs = deltaSec > 0 ? Number((deltaSec * 1000).toFixed(1)) : existing.periodMs;
        const freqHz = periodMs > 0 ? Math.round(1000 / periodMs) : existing.freqHz;

        const byteDeltas = f.data.map((b, idx) => {
          const oldB = existing.data[idx];
          if (oldB === undefined || oldB === b) return 0;
          return b > oldB ? 1 : -1;
        });

        const changedBytes = f.data.map((b, idx) => existing.data[idx] !== b);
        const changedBits = f.data.map((b, idx) => ((existing.data[idx] ?? 0) ^ b) & 0xFF);

        existing.prevData = existing.data;
        existing.data = f.data;
        existing.changedBytes = changedBytes;
        existing.changedBits = changedBits;
        existing.byteDeltas = byteDeltas;
        existing.timestamp = f.timestamp;
        existing.periodMs = periodMs;
        existing.freqHz = freqHz;
        existing.count = (existing.count || 0) + 1;
        existing.ascii = f.ascii;
        existing.frame = f;
        if (f.name && !existing.name) existing.name = f.name;
      }
    }

    let list = Array.from(map.values()).map(r => ({
      ...r,
      lastDeltaSec: Number((currentTime - r.timestamp).toFixed(2))
    }));

    // Apply search filter using the unified multi-search and D1-D8 matcher
    if (searchTokens.length > 0) {
      list = list.filter(r => matchSearchQuery(searchTokens, r));
    }

    // Filter mode
    if (filterMode === 'changed') {
      list = list.filter(r => r.changedBytes.some(Boolean));
    } else if (filterMode === 'new_ids') {
      list = list.filter(r => r.isNewId);
    }

    // Sort with smart secondary tie-breaker (CAN ID numerical order)
    list.sort((a, b) => {
      let diff = 0;
      if (snifferSortBy === 'id') diff = a.decimalId - b.decimalId;
      else if (snifferSortBy === 'period') diff = a.periodMs - b.periodMs;
      else if (snifferSortBy === 'count') diff = a.count - b.count;
      else if (snifferSortBy === 'activity') diff = a.lastDeltaSec - b.lastDeltaSec;

      if (diff !== 0) {
        return snifferSortAsc ? diff : -diff;
      }
      return a.decimalId - b.decimalId;
    });

    return list;
  }, [frames, searchTokens, filterMode, snifferSortBy, snifferSortAsc]);

  // SavvyLens Trace Virtualization Calculation
  const ROW_HEIGHT = 38;
  const totalRows = filteredFrames.length;
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
  const bufferCount = 8;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - bufferCount);
  const endIndex = Math.min(totalRows, Math.floor(scrollTop / ROW_HEIGHT) + visibleCount + bufferCount);
  const visibleFrames = useMemo(() => {
    return filteredFrames.slice(startIndex, endIndex);
  }, [filteredFrames, startIndex, endIndex]);
  const topPadding = startIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);

  // Keep selected frame centered when search, filters, sorting, or view mode changes
  const lastCenterKeyRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!selectedFrame) return;

    const currentKey = `${searchTerm}|${filterMode}|${traceSortBy}|${traceSortAsc}|${snifferSortBy}|${snifferSortAsc}|${viewMode}`;
    if (lastCenterKeyRef.current === currentKey) return;
    lastCenterKeyRef.current = currentKey;

    const frameIdToFind = selectedFrame.id.toLowerCase();
    const frameTs = selectedFrame.timestamp;

    const rafId = requestAnimationFrame(() => {
      if (viewMode === 'trace' && tableContainerRef.current) {
        const idx = filteredFrames.findIndex(f => 
          f.id.toLowerCase() === frameIdToFind && 
          Math.abs(f.timestamp - frameTs) < 0.0001
        );

        if (idx >= 0) {
          const targetScroll = Math.max(0, idx * ROW_HEIGHT - containerHeight / 2 + ROW_HEIGHT / 2);
          tableContainerRef.current.scrollTop = targetScroll;
          setAutoScroll(false); // Pause auto-scroll so the viewport stays centered on the selected message
        }
      } else if (viewMode === 'sniffer' && snifferContainerRef.current) {
        const rowIdx = aggregatedSnifferRows.findIndex(r => 
          r.id.toLowerCase() === frameIdToFind
        );

        if (rowIdx >= 0) {
          const rowHeight = 42;
          const targetScroll = Math.max(0, rowIdx * rowHeight - containerHeight / 2 + rowHeight / 2);
          snifferContainerRef.current.scrollTop = targetScroll;
        }
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [
    searchTerm,
    filterMode,
    traceSortBy,
    traceSortAsc,
    snifferSortBy,
    snifferSortAsc,
    viewMode,
    selectedFrame,
    filteredFrames,
    aggregatedSnifferRows,
    containerHeight
  ]);

  // Auto-scroll handler for Trace mode
  React.useEffect(() => {
    if (viewMode === 'trace' && autoScroll && tableContainerRef.current) {
      tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
    }
  }, [frames.length, viewMode, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 80;
    if (!isNearBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isNearBottom && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const handleNotchAllActiveBits = () => {
    setNotchedBitsMap(prev => {
      const next = new Map(prev);
      aggregatedSnifferRows.forEach(row => {
        const existing = next.get(row.id) || new Array(row.data.length).fill(0);
        const updated = row.data.map((_, idx) => (existing[idx] || 0) | (row.changedBits[idx] || 0));
        next.set(row.id, updated);
      });
      return next;
    });
  };

  const handleClearNotches = () => {
    setNotchedBitsMap(new Map());
  };

  // SavvyLens Signal Type Heuristic Analysis (bounded to last 250 frames for instant speed)
  const signalAnalysis = useMemo<FrameSignalAnalysis | null>(() => {
    if (!selectedFrame) return null;
    const allMatching = frames.filter(f => f.id.toLowerCase() === selectedFrame.id.toLowerCase());
    const framesForId = allMatching.length > 250 ? allMatching.slice(allMatching.length - 250) : allMatching;
    return analyzeFrameSignals(framesForId, selectedFrame);
  }, [selectedFrame, frames]);

  // SavvyLens Surrounding Event Correlation Analysis (bounded to +/- 5s window)
  const correlatedEvents = useMemo<CorrelatedEvent[]>(() => {
    if (!selectedFrame) return [];
    const minTs = selectedFrame.timestamp - 5;
    const maxTs = selectedFrame.timestamp + 5;
    const boundedFrames = frames.filter(f => f.timestamp >= minTs && f.timestamp <= maxTs);
    return analyzeSurroundingCorrelations(boundedFrames, selectedFrame, correlationWindowMs);
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
                placeholder="Multi-search (comma or space): e.g. 0x120, 0x240 or D1:24, D4:02, data:DE AD, ASCII..."
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

          {/* Performance View Mode Toggle & Quick Filter Pills */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            {/* View Mode Switcher: Trace Stream on left (default), Sniffer (Grouped) on right */}
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('trace')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                  viewMode === 'trace'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Trace Stream: Chronological streaming log with virtualized smooth 60 FPS scrolling and smart sorting"
              >
                <History className="w-3.5 h-3.5" />
                <span>Trace Stream</span>
              </button>
              <button
                onClick={() => setViewMode('sniffer')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                  viewMode === 'sniffer'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Sniffer Mode: Groups messages by unique CAN ID with period, frequency, and live delta highlights"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Sniffer (Grouped)</span>
              </button>
            </div>

            {/* SavvyLens Quick Filter Pills */}
            <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition cursor-pointer ${
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
                className={`px-2 py-1 rounded-lg font-medium transition cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1 transition cursor-pointer ${
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
                className={`px-2 py-1 rounded-lg font-medium transition cursor-pointer ${
                  filterMode === 'tx' 
                    ? 'bg-amber-600 text-white shadow-xs' 
                    : 'text-slate-400 hover:text-amber-300'
                }`}
              >
                TX
              </button>
            </div>
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

        {/* Mode-Specific Action Bar (Notching, Sorting, Auto-scroll, Row Telemetry) */}
        <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          {viewMode === 'sniffer' ? (
            <>
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 font-medium">SavvyCAN Notcher:</span>
                <button
                  onClick={handleNotchAllActiveBits}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-medium flex items-center space-x-1.5 transition cursor-pointer"
                  title="Snapshot all currently toggling bits to eliminate background bus noise (cansniffer notch)"
                >
                  <Filter className="w-3 h-3 text-amber-400" />
                  <span>Notch Active Bits</span>
                </button>
                {notchedBitsMap.size > 0 && (
                  <button
                    onClick={handleClearNotches}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] transition cursor-pointer"
                  >
                    Reset Notches ({notchedBitsMap.size} IDs)
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400">Sort by:</span>
                  <select
                    value={snifferSortBy}
                    onChange={(e) => setSnifferSortBy(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 text-white rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-hidden cursor-pointer"
                  >
                    <option value="id">CAN ID (Hex)</option>
                    <option value="period">Period (Cycle Time)</option>
                    <option value="count">Message Count</option>
                    <option value="activity">Last Active (Recency)</option>
                  </select>
                  <button
                    onClick={() => setSnifferSortAsc(!snifferSortAsc)}
                    className="p-1 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                    title={snifferSortAsc ? 'Ascending (Click for Descending)' : 'Descending (Click for Ascending)'}
                  >
                    {snifferSortAsc ? '▲' : '▼'}
                  </button>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 font-mono text-[11px]">
                  {aggregatedSnifferRows.length} Unique CAN IDs
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center space-x-3 flex-wrap gap-y-1.5">
                {/* Trace Stream Smart Sort Controls */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400 font-medium">Sort by:</span>
                  <select
                    value={traceSortBy}
                    onChange={(e) => {
                      setTraceSortBy(e.target.value as any);
                      if (e.target.value !== 'time') setAutoScroll(false);
                    }}
                    className="bg-slate-950 border border-slate-800 text-white rounded-lg px-2 py-0.5 text-xs font-mono focus:outline-hidden cursor-pointer"
                  >
                    <option value="time">Timestamp (Arrival Order)</option>
                    <option value="id">CAN ID (Hex)</option>
                    <option value="bus">Bus Channel</option>
                    <option value="dlc">DLC Length</option>
                    <option value="name">Message Name</option>
                    <option value="period">Period (Delta)</option>
                    <option value="count">Message Count</option>
                  </select>
                  <button
                    onClick={() => {
                      setTraceSortAsc(!traceSortAsc);
                      setAutoScroll(false);
                    }}
                    className="p-1 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded-lg cursor-pointer"
                    title={traceSortAsc ? 'Ascending (Click for Descending)' : 'Descending (Click for Ascending)'}
                  >
                    {traceSortAsc ? '▲' : '▼'}
                  </button>
                </div>

                <div className="h-4 w-px bg-slate-800 hidden sm:block" />

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={`px-2.5 py-1 rounded-lg font-medium flex items-center space-x-1.5 border transition cursor-pointer ${
                      autoScroll
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                    title={autoScroll ? 'Streaming live (Click to pause follow)' : 'Auto-scroll paused (Click to follow live)'}
                  >
                    <span className={`w-2 h-2 rounded-full ${autoScroll ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    <span>{autoScroll ? 'Auto-Scroll ON' : 'Auto-Scroll PAUSED'}</span>
                  </button>

                  <button
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollTop = 0;
                        setAutoScroll(false);
                      }
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition cursor-pointer"
                  >
                    Jump to Top
                  </button>
                  <button
                    onClick={() => {
                      if (tableContainerRef.current) {
                        tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
                        setAutoScroll(true);
                      }
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] transition cursor-pointer"
                  >
                    Jump to Latest
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-slate-500 text-[11px] font-sans">
                  Windowed View (60 FPS):
                </span>
                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 font-mono text-[11px]">
                  Rendering {visibleFrames.length} of {filteredFrames.length.toLocaleString()} frames
                </span>
              </div>
            </>
          )}
        </div>

        {/* Dynamic Display: Sniffer Mode (Grouped by ID) or Trace Mode (Virtualized Chronological Stream) */}
        {viewMode === 'sniffer' ? (
          <div ref={snifferContainerRef} className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead className="bg-slate-900/95 text-slate-400 sticky top-0 border-b border-slate-800 select-none z-10">
                <tr>
                  <th className="py-2.5 px-3 font-medium">CAN ID</th>
                  <th className="py-2.5 px-3 font-medium">Message Name</th>
                  <th className="py-2.5 px-3 font-medium">Bus</th>
                  <th className="py-2.5 px-3 font-medium">DLC</th>
                  <th className="py-2.5 px-3 font-medium">Data Bytes (D1–D8) with Live Deltas</th>
                  <th className="py-2.5 px-3 font-medium">ASCII</th>
                  <th className="py-2.5 px-3 font-medium text-right">Period</th>
                  <th className="py-2.5 px-3 font-medium text-right">Freq</th>
                  <th className="py-2.5 px-3 font-medium text-right">Count</th>
                  <th className="py-2.5 px-3 font-medium text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {aggregatedSnifferRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-slate-500 font-sans">
                      <div className="max-w-md mx-auto space-y-2">
                        <p className="font-medium text-slate-400">No CAN IDs match current filter.</p>
                        <p className="text-xs text-slate-500">
                          Connect hardware, transmit a test frame, or adjust search criteria.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  aggregatedSnifferRows.map((row) => {
                    const isSelected = selectedFrame?.id === row.id;
                    const notchedMask = notchedBitsMap.get(row.id);

                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedFrame(row.frame)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-blue-600/20 border-l-2 border-blue-500' 
                            : 'hover:bg-slate-900/60'
                        }`}
                      >
                        <td className="py-2 px-3 font-bold text-blue-400 flex items-center space-x-1.5">
                          <span>{row.id}</span>
                          {row.isNewId && (
                            <span className="text-[9px] font-sans px-1 py-0.2 bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded font-semibold">
                              NEW
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-200 font-sans font-medium">{row.name || 'Unknown'}</td>
                        <td className="py-2 px-3 text-slate-300">can{row.bus}</td>
                        <td className="py-2 px-3 text-slate-400">{row.dlc}</td>

                        {/* Sniffer Payload with Live Byte Deltas & Notching */}
                        <td className="py-2 px-3 tracking-wider">
                          <div className="flex items-center space-x-1.5 font-mono">
                            {row.data.map((byte, bIdx) => {
                              const delta = row.byteDeltas[bIdx] ?? 0;
                              const hexStr = byte.toString(16).toUpperCase().padStart(2, '0');
                              const pulse = latchedPulses.get(`${row.id}_D${bIdx}`);
                              const base = baselineMap.get(row.id);
                              const baseVal = base?.baselineData[bIdx];
                              const isDeviating = baselineActive && baseVal !== undefined && baseVal !== byte;
                              const isByteNotched = notchedMask && ((notchedMask[bIdx] || 0) & 0xFF) !== 0;

                              let colorClass = 'text-slate-300 bg-slate-950/40 border-slate-800/40 hover:border-blue-500/50 hover:text-white';
                              if (pulse) {
                                colorClass = 'bg-amber-500/30 text-amber-200 font-bold border-amber-500/80 shadow-xs ring-1 ring-amber-500/40';
                              } else if (isDeviating) {
                                colorClass = 'bg-rose-500/25 text-rose-200 font-bold border-rose-500/50';
                              } else if (highlightChanges && delta > 0) {
                                colorClass = 'bg-emerald-500/25 text-emerald-300 font-bold border-emerald-500/50 shadow-xs';
                              } else if (highlightChanges && delta < 0) {
                                colorClass = 'bg-rose-500/25 text-rose-300 font-bold border-rose-500/50 shadow-xs';
                              } else if (isByteNotched) {
                                colorClass = 'text-slate-600 bg-slate-950/20 border-slate-900/30 opacity-60';
                              }

                              return (
                                <div
                                  key={bIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCorrelatorFrame(row.frame);
                                    setCorrelatorByteIdx(bIdx);
                                    setCorrelatorOpen(true);
                                  }}
                                  title={
                                    pulse
                                      ? `Latched Pulse: Base 0x${pulse.baselineVal.toString(16).padStart(2, '0')} ➔ Peak 0x${pulse.peakVal.toString(16).padStart(2, '0')}\nClick to correlate`
                                      : delta !== 0
                                      ? `Byte D${bIdx + 1}: 0x${hexStr} (${delta > 0 ? '+Increased' : '-Decreased'})\nPrev: 0x${(row.prevData?.[bIdx] ?? byte).toString(16).toUpperCase().padStart(2, '0')}\nClick to correlate`
                                      : `Byte D${bIdx + 1}: 0x${hexStr}\nClick to correlate`
                                  }
                                  className={`px-1.5 py-0.5 rounded border transition inline-flex flex-col items-center cursor-pointer relative group ${colorClass}`}
                                >
                                  <div className="flex items-center space-x-1">
                                    <span className="text-[8px] text-slate-500 font-sans leading-none pb-0.5 select-none">D{bIdx + 1}</span>
                                    {pulse && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
                                    )}
                                  </div>
                                  <span className="leading-none text-[11px]">{hexStr}</span>
                                  {delta !== 0 && (
                                    <span className={`text-[8px] font-bold leading-none mt-0.5 ${delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {delta > 0 ? '+' : '-'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>

                        <td className="py-2 px-3 text-slate-400 font-sans">{row.ascii}</td>
                        <td className="py-2 px-3 text-right text-slate-300 font-mono">{row.periodMs > 0 ? `${row.periodMs.toFixed(1)}ms` : '—'}</td>
                        <td className="py-2 px-3 text-right text-slate-300 font-mono">{row.freqHz > 0 ? `${row.freqHz}Hz` : '—'}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{row.count.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-slate-500 font-mono text-[11px]">
                          {row.lastDeltaSec < 1 ? '<1s' : `${row.lastDeltaSec.toFixed(1)}s`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* TRACE VIEW: Virtualized Chronological 60 FPS Stream */
          <div ref={tableContainerRef} onScroll={handleScroll} className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse font-mono text-xs">
              <thead className="bg-slate-900/95 text-slate-400 sticky top-0 border-b border-slate-800 select-none z-10">
                <tr>
                  <th 
                    onClick={() => {
                      if (traceSortBy === 'time') setTraceSortAsc(!traceSortAsc);
                      else { setTraceSortBy('time'); setTraceSortAsc(true); }
                    }}
                    className="py-2.5 px-3 font-medium cursor-pointer hover:text-white transition select-none"
                    title="Sort by Timestamp (Arrival Order)"
                  >
                    Timestamp {traceSortBy === 'time' && (traceSortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    onClick={() => {
                      if (traceSortBy === 'bus') setTraceSortAsc(!traceSortAsc);
                      else { setTraceSortBy('bus'); setTraceSortAsc(true); setAutoScroll(false); }
                    }}
                    className="py-2.5 px-3 font-medium cursor-pointer hover:text-white transition select-none"
                    title="Sort by Bus Channel"
                  >
                    Bus {traceSortBy === 'bus' && (traceSortAsc ? '▲' : '▼')}
                  </th>
                  <th className="py-2.5 px-3 font-medium">Dir</th>
                  <th 
                    onClick={() => {
                      if (traceSortBy === 'id') setTraceSortAsc(!traceSortAsc);
                      else { setTraceSortBy('id'); setTraceSortAsc(true); setAutoScroll(false); }
                    }}
                    className="py-2.5 px-3 font-medium cursor-pointer hover:text-white transition select-none"
                    title="Sort by CAN ID"
                  >
                    CAN ID {traceSortBy === 'id' && (traceSortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    onClick={() => {
                      if (traceSortBy === 'name') setTraceSortAsc(!traceSortAsc);
                      else { setTraceSortBy('name'); setTraceSortAsc(true); setAutoScroll(false); }
                    }}
                    className="py-2.5 px-3 font-medium cursor-pointer hover:text-white transition select-none"
                    title="Sort by Message Name"
                  >
                    Message Name {traceSortBy === 'name' && (traceSortAsc ? '▲' : '▼')}
                  </th>
                  <th 
                    onClick={() => {
                      if (traceSortBy === 'dlc') setTraceSortAsc(!traceSortAsc);
                      else { setTraceSortBy('dlc'); setTraceSortAsc(true); setAutoScroll(false); }
                    }}
                    className="py-2.5 px-3 font-medium cursor-pointer hover:text-white transition select-none"
                    title="Sort by DLC Length"
                  >
                    DLC {traceSortBy === 'dlc' && (traceSortAsc ? '▲' : '▼')}
                  </th>
                  <th className="py-2.5 px-3 font-medium">Data Bytes (D1–D8)</th>
                  <th className="py-2.5 px-3 font-medium">ASCII</th>
                  <th 
                    onClick={() => {
                      if (traceSortBy === 'count') setTraceSortAsc(!traceSortAsc);
                      else { setTraceSortBy('count'); setTraceSortAsc(true); setAutoScroll(false); }
                    }}
                    className="py-2.5 px-3 font-medium text-right cursor-pointer hover:text-white transition select-none"
                    title="Sort by Message Count"
                  >
                    Count {traceSortBy === 'count' && (traceSortAsc ? '▲' : '▼')}
                  </th>
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
                  <>
                    {topPadding > 0 && (
                      <tr style={{ height: `${topPadding}px` }}>
                        <td colSpan={9} className="p-0 border-0" />
                      </tr>
                    )}
                    {visibleFrames.map((frame, idx) => {
                      const isSelected = selectedFrame?.id === frame.id && selectedFrame?.timestamp === frame.timestamp;
                      return (
                        <tr 
                          key={`${frame.id}-${frame.timestamp}-${startIndex + idx}`}
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
                    })}
                    {bottomPadding > 0 && (
                      <tr style={{ height: `${bottomPadding}px` }}>
                        <td colSpan={9} className="p-0 border-0" />
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
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
