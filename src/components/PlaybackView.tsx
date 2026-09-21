import React, { useState, useMemo } from 'react';
import { 
  Play, Pause, RotateCcw, Film, Clock, Search, Layers, Zap,
  ArrowRight, Shield, Sparkles, Filter, Sliders, ChevronRight,
  GitMerge, CheckCircle, AlertTriangle, Eye, ArrowDownRight, Compass
} from 'lucide-react';
import { CANFrame, OfflineBaselineAnalysisResult } from '../types';
import { analyzeEventWindowAgainstBaseline, describeBitDifference } from '../utils/baselineAnalysis';
import { ValueCorrelationModal } from './ValueCorrelationModal';

interface PlaybackViewProps {
  frames: CANFrame[];
}

export const PlaybackView: React.FC<PlaybackViewProps> = ({ frames }) => {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  // Baseline Selection Mode: 'relative' (e.g. N seconds before selected message) vs 'range' (explicit time bracket)
  const [baselineMode, setBaselineMode] = useState<'relative' | 'range'>('relative');
  const [relativePriorSec, setRelativePriorSec] = useState<number>(3.0);
  const [relativeEventSec, setRelativeEventSec] = useState<number>(2.0);

  // Range mode bracket (in seconds)
  const [rangeBaseStart, setRangeBaseStart] = useState<number>(0);
  const [rangeBaseEnd, setRangeBaseEnd] = useState<number>(5.0);
  const [rangeEventStart, setRangeEventStart] = useState<number>(5.0);
  const [rangeEventEnd, setRangeEventEnd] = useState<number>(10.0);

  // Selected message in log table
  const [selectedLogIndex, setSelectedLogIndex] = useState<number>(
    Math.min(frames.length > 20 ? 15 : 0, frames.length - 1)
  );

  // Active analysis tab: 'pulses' | 'shifts' | 'new_ids' | 'masked_counters'
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'pulses' | 'shifts' | 'new_ids' | 'masked_counters'>('pulses');

  // Value Correlation Modal State
  const [correlatingFrame, setCorrelatingFrame] = useState<CANFrame | null>(null);
  const [correlatingByteIdx, setCorrelatingByteIdx] = useState<number>(0);
  const [isCorrelatorOpen, setIsCorrelatorOpen] = useState<boolean>(false);

  // Total log time
  const totalLogTime = useMemo(() => {
    if (frames.length === 0) return 0;
    return frames[frames.length - 1]?.timestamp || 0;
  }, [frames]);

  const currentFrame = frames[currentFrameIdx] || frames[0];
  const selectedLogFrame = frames[selectedLogIndex] || frames[0];

  // Calculate baseline & event frame indices based on selection mode
  const { baseStartIdx, baseEndIdx, evtStartIdx, evtEndIdx } = useMemo(() => {
    if (frames.length === 0) return { baseStartIdx: 0, baseEndIdx: 0, evtStartIdx: 0, evtEndIdx: 0 };

    if (baselineMode === 'relative') {
      const refTime = selectedLogFrame?.timestamp || 0;
      const baseStartTime = Math.max(0, refTime - relativePriorSec);
      const baseEndTime = refTime;
      const evtStartTime = refTime;
      const evtEndTime = Math.min(totalLogTime, refTime + relativeEventSec);

      const bStart = frames.findIndex(f => f.timestamp >= baseStartTime);
      const bEnd = frames.findIndex(f => f.timestamp >= baseEndTime);
      const eStart = frames.findIndex(f => f.timestamp >= evtStartTime);
      const eEnd = frames.findIndex(f => f.timestamp >= evtEndTime);

      return {
        baseStartIdx: Math.max(0, bStart >= 0 ? bStart : 0),
        baseEndIdx: Math.max(0, bEnd >= 0 ? bEnd : Math.floor(frames.length / 2)),
        evtStartIdx: Math.max(0, eStart >= 0 ? eStart : Math.floor(frames.length / 2)),
        evtEndIdx: Math.min(frames.length - 1, eEnd >= 0 ? eEnd : frames.length - 1)
      };
    } else {
      const bStart = frames.findIndex(f => f.timestamp >= rangeBaseStart);
      const bEnd = frames.findIndex(f => f.timestamp >= rangeBaseEnd);
      const eStart = frames.findIndex(f => f.timestamp >= rangeEventStart);
      const eEnd = frames.findIndex(f => f.timestamp >= rangeEventEnd);

      return {
        baseStartIdx: Math.max(0, bStart >= 0 ? bStart : 0),
        baseEndIdx: Math.max(0, bEnd >= 0 ? bEnd : Math.floor(frames.length / 2)),
        evtStartIdx: Math.max(0, eStart >= 0 ? eStart : Math.floor(frames.length / 2)),
        evtEndIdx: Math.min(frames.length - 1, eEnd >= 0 ? eEnd : frames.length - 1)
      };
    }
  }, [frames, baselineMode, selectedLogFrame, relativePriorSec, relativeEventSec, totalLogTime, rangeBaseStart, rangeBaseEnd, rangeEventStart, rangeEventEnd]);

  // Run offline differential baseline analysis
  const analysis: OfflineBaselineAnalysisResult = useMemo(() => {
    if (frames.length === 0) {
      return {
        baselineRange: { startTime: 0, endTime: 0, startFrameIndex: 0, endFrameIndex: 0, frameCount: 0 },
        eventRange: { startTime: 0, endTime: 0, startFrameIndex: 0, endFrameIndex: 0, frameCount: 0 },
        pulses: [],
        stateShifts: [],
        newEventIds: [],
        maskedCounterBytes: []
      };
    }

    return analyzeEventWindowAgainstBaseline(
      frames,
      baseStartIdx,
      baseEndIdx,
      evtStartIdx,
      evtEndIdx
    );
  }, [frames, baseStartIdx, baseEndIdx, evtStartIdx, evtEndIdx]);

  // Launch Value Correlator for a specific pulse/command
  const openCorrelatorForPulse = (pulse: OfflineBaselineAnalysisResult['pulses'][0]) => {
    const frame: CANFrame = frames[pulse.frameIndex] || {
      id: pulse.canId,
      decimalId: parseInt(pulse.canId, 16) || 0,
      timestamp: pulse.timestamp,
      bus: 1,
      dlc: 8,
      data: [0, 0, 0, 0, 0, 0, 0, 0],
      ascii: '........',
      count: 1
    };

    setCorrelatingFrame(frame);
    setCorrelatingByteIdx(pulse.byteIndex);
    setIsCorrelatorOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-y-auto select-none font-sans">
      <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
        
        {/* Header Banner */}
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Film className="w-5 h-5 text-blue-400" />
              <span>CAN Log Playback & Offline Baseline Analyzer</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Isolate unknown button pulses (00 ➔ 40 ➔ 00), persistent state shifts, and command-to-state echoes using relative or time-range baselines
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
            <span className="text-xs text-slate-400 font-medium px-2">Baseline Setup:</span>
            <button
              onClick={() => setBaselineMode('relative')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                baselineMode === 'relative' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Relative to Selected Message
            </button>
            <button
              onClick={() => setBaselineMode('range')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                baselineMode === 'range' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Explicit Time Range
            </button>
          </div>
        </div>

        {/* Baseline & Event Window Configuration Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {baselineMode === 'relative' ? 'Relative Message-Centric Baseline' : 'Explicit Time-Bracket Baseline'}
              </span>
            </div>

            {/* Quick Presets for Relative Mode */}
            {baselineMode === 'relative' ? (
              <div className="flex items-center space-x-4 text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">Baseline Prior Window:</span>
                  {[1.0, 2.0, 3.0, 5.0, 10.0].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setRelativePriorSec(sec)}
                      className={`px-2 py-1 rounded font-bold transition ${
                        relativePriorSec === sec 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">Event Window:</span>
                  {[1.0, 2.0, 5.0].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => setRelativeEventSec(sec)}
                      className={`px-2 py-1 rounded font-bold transition ${
                        relativeEventSec === sec 
                          ? 'bg-amber-600 text-white' 
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      +{sec}s
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-4 text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">Baseline Range:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={rangeBaseStart}
                    onChange={e => setRangeBaseStart(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-slate-800 px-2 py-1 rounded text-white text-center"
                  />
                  <span>to</span>
                  <input
                    type="number"
                    step="0.5"
                    value={rangeBaseEnd}
                    onChange={e => setRangeBaseEnd(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-slate-800 px-2 py-1 rounded text-white text-center"
                  />
                  <span>s</span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-slate-400">Event Range:</span>
                  <input
                    type="number"
                    step="0.5"
                    value={rangeEventStart}
                    onChange={e => setRangeEventStart(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-slate-800 px-2 py-1 rounded text-white text-center"
                  />
                  <span>to</span>
                  <input
                    type="number"
                    step="0.5"
                    value={rangeEventEnd}
                    onChange={e => setRangeEventEnd(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-slate-800 px-2 py-1 rounded text-white text-center"
                  />
                  <span>s</span>
                </div>
              </div>
            )}
          </div>

          {/* Active Ranges Visual Status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-xl border border-blue-900/40">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold text-blue-400">Baseline Window</span>
              <span className="text-sm font-bold text-white">
                +{analysis.baselineRange.startTime.toFixed(3)}s ➔ +{analysis.baselineRange.endTime.toFixed(3)}s
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {analysis.baselineRange.frameCount} frames sampled
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-amber-900/40">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold text-amber-400">Event Target Window</span>
              <span className="text-sm font-bold text-white">
                +{analysis.eventRange.startTime.toFixed(3)}s ➔ +{analysis.eventRange.endTime.toFixed(3)}s
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                {analysis.eventRange.frameCount} event frames inspected
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-emerald-900/40">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold text-emerald-400">Pulses & Transitions</span>
              <span className="text-base font-bold text-emerald-400">
                {analysis.pulses.length} Pulses | {analysis.stateShifts.length} Shifts
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Transient 00 ➔ 40 ➔ 00 isolated
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-semibold text-slate-400">Masked Alive Counters</span>
              <span className="text-base font-bold text-slate-300">
                {analysis.maskedCounterBytes.length} bytes masked
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                0-15 cycling nibbles ignored
              </span>
            </div>
          </div>
        </div>

        {/* Differential Results & Pulses Inspector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          {/* Tabs */}
          <div className="px-5 pt-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveAnalysisTab('pulses')}
                className={`px-4 py-2 rounded-t-xl text-xs font-bold transition flex items-center space-x-2 border-b-2 ${
                  activeAnalysisTab === 'pulses'
                    ? 'border-amber-500 text-amber-300 bg-slate-950/60'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Momentary Button Pulses ({analysis.pulses.length})</span>
              </button>

              <button
                onClick={() => setActiveAnalysisTab('shifts')}
                className={`px-4 py-2 rounded-t-xl text-xs font-bold transition flex items-center space-x-2 border-b-2 ${
                  activeAnalysisTab === 'shifts'
                    ? 'border-indigo-500 text-indigo-300 bg-slate-950/60'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>Persistent State Shifts ({analysis.stateShifts.length})</span>
              </button>

              <button
                onClick={() => setActiveAnalysisTab('new_ids')}
                className={`px-4 py-2 rounded-t-xl text-xs font-bold transition flex items-center space-x-2 border-b-2 ${
                  activeAnalysisTab === 'new_ids'
                    ? 'border-blue-500 text-blue-300 bg-slate-950/60'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>New Event IDs ({analysis.newEventIds.length})</span>
              </button>

              <button
                onClick={() => setActiveAnalysisTab('masked_counters')}
                className={`px-4 py-2 rounded-t-xl text-xs font-bold transition flex items-center space-x-2 border-b-2 ${
                  activeAnalysisTab === 'masked_counters'
                    ? 'border-slate-500 text-slate-200 bg-slate-950/60'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span>Masked Noise / Counters ({analysis.maskedCounterBytes.length})</span>
              </button>
            </div>

            <span className="text-[11px] text-slate-500 font-mono">
              E-GMP Bit-Level Edge & Pulse Extraction
            </span>
          </div>

          {/* Tab Content */}
          <div className="p-5">
            {activeAnalysisTab === 'pulses' && (
              <div className="space-y-3">
                {analysis.pulses.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400">
                    <p className="text-sm font-semibold">No momentary pulses detected in this event window.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try widening the event window or clicking on another log message where the button was pressed.
                    </p>
                  </div>
                ) : (
                  analysis.pulses.map((pulse, idx) => {
                    const hexBase = pulse.baselineValue.toString(16).toUpperCase().padStart(2, '0');
                    const hexPeak = pulse.spikedValue.toString(16).toUpperCase().padStart(2, '0');
                    const hexRet = pulse.returnedValue.toString(16).toUpperCase().padStart(2, '0');
                    const bitDetail = describeBitDifference(pulse.baselineValue, pulse.spikedValue);

                    return (
                      <div
                        key={idx}
                        className="p-4 bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 rounded-xl transition flex flex-wrap items-center justify-between gap-4 font-mono text-xs"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-center min-w-[70px]">
                            <span className="text-[10px] block text-slate-400 font-sans font-semibold">CAN ID</span>
                            <span className="font-bold text-sm">{pulse.canId}</span>
                          </div>

                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-white text-sm">
                                Byte D{pulse.byteIndex + 1} Spiked & Returned
                              </span>
                              <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-700/40 rounded text-amber-300 font-bold text-[10px]">
                                {bitDetail}
                              </span>
                            </div>

                            <div className="flex items-center space-x-3 text-slate-400 mt-1">
                              <span className="text-slate-300">
                                Pulse: <strong className="text-slate-400">0x{hexBase}</strong> ➔ <strong className="text-amber-300 text-sm font-bold">0x{hexPeak}</strong> ➔ <strong className="text-slate-400">0x{hexRet}</strong>
                              </span>
                              <span>•</span>
                              <span>Duration: <strong className="text-white">{pulse.durationMs} ms</strong></span>
                              <span>•</span>
                              <span>Time: <strong className="text-slate-300">+{pulse.timestamp.toFixed(3)}s</strong> (Frame #{pulse.frameIndex})</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setSelectedLogIndex(pulse.frameIndex)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                          >
                            Jump to Frame
                          </button>

                          <button
                            onClick={() => openCorrelatorForPulse(pulse)}
                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition"
                          >
                            <GitMerge className="w-3.5 h-3.5" />
                            <span>Find Value Echoes</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeAnalysisTab === 'shifts' && (
              <div className="space-y-3">
                {analysis.stateShifts.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400">
                    <p className="text-sm font-semibold">No persistent state shifts detected in this window.</p>
                  </div>
                ) : (
                  analysis.stateShifts.map((shift, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400 font-bold">
                          {shift.canId}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">
                            Byte D{shift.byteIndex + 1} Shifted to New Steady State
                          </div>
                          <div className="text-slate-400 mt-1">
                            Transition: 0x{shift.fromValue.toString(16).toUpperCase().padStart(2, '0')} ➔ 0x{shift.toValue.toString(16).toUpperCase().padStart(2, '0')} at +{shift.firstTransitionTime.toFixed(3)}s
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedLogIndex(shift.frameIndex)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                      >
                        Inspect Transition
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeAnalysisTab === 'new_ids' && (
              <div className="space-y-3">
                {analysis.newEventIds.length === 0 ? (
                  <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800 text-slate-400">
                    <p className="text-sm font-semibold">No new CAN IDs appeared during the event window.</p>
                    <p className="text-xs text-slate-500 mt-1">All messages were already broadcasting in steady-state baseline.</p>
                  </div>
                ) : (
                  analysis.newEventIds.map((item, idx) => (
                    <div key={idx} className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center space-x-3">
                        <span className="font-bold text-blue-400 text-sm">{item.canId}</span>
                        <span className="text-slate-300 font-sans">{item.name || 'Event Message'}</span>
                        <span className="text-slate-500">First seen at +{item.firstSeenTime.toFixed(3)}s</span>
                      </div>
                      <span className="text-slate-400 font-semibold">{item.count} frames</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeAnalysisTab === 'masked_counters' && (
              <div className="space-y-3">
                {analysis.maskedCounterBytes.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No rolling counters or high-jitter bytes flagged in baseline.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                    {analysis.maskedCounterBytes.map((m, idx) => (
                      <div key={idx} className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg flex items-center justify-between">
                        <span className="text-blue-400 font-bold">{m.canId} D{m.byteIndex + 1}</span>
                        <span className="text-slate-400 text-[11px]">{m.pattern}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Replay Scrubber & Log Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Playback Timeline</span>
              <div className="text-xl font-mono font-bold text-white">
                +{currentFrame?.timestamp?.toFixed(3) || '0.000'}s / +{totalLogTime.toFixed(3)}s
                <span className="text-xs text-slate-400 font-normal ml-3">
                  (Frame #{currentFrameIdx + 1} of {frames.length})
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {[0.2, 0.5, 1, 2, 5].map(spd => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    playbackSpeed === spd ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={currentFrameIdx}
              onChange={e => {
                const idx = Number(e.target.value);
                setCurrentFrameIdx(idx);
                setSelectedLogIndex(idx);
              }}
              className="w-full accent-blue-600 bg-slate-950 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>0.000s</span>
              <span>+{(totalLogTime / 2).toFixed(3)}s</span>
              <span>+{totalLogTime.toFixed(3)}s</span>
            </div>
          </div>

          {/* Interactive Frame Browser Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Recorded Frame Stream (Click any frame to set as Baseline Event Center)</span>
              <span>Showing {frames.length} frames</span>
            </div>

            <div className="max-h-64 overflow-y-auto font-mono text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/95 text-slate-400 sticky top-0 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">CAN ID</th>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">DLC</th>
                    <th className="py-2 px-3">Data Bytes</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {frames.slice(0, 100).map((f, idx) => {
                    const isSelected = selectedLogIndex === idx;
                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedLogIndex(idx)}
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-blue-600/20 text-white font-bold' : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <td className="py-1.5 px-3 text-slate-500">#{idx + 1}</td>
                        <td className="py-1.5 px-3 text-slate-400">+{f.timestamp.toFixed(4)}s</td>
                        <td className="py-1.5 px-3 text-blue-400 font-bold">{f.id}</td>
                        <td className="py-1.5 px-3 font-sans text-slate-200">{f.name || 'CAN_FRAME'}</td>
                        <td className="py-1.5 px-3 text-slate-400">{f.dlc}</td>
                        <td className="py-1.5 px-3">
                          <div className="flex space-x-1 font-mono">
                            {f.data.map((b, bIdx) => (
                              <span key={bIdx} className="px-1 bg-slate-950/80 rounded border border-slate-800 text-[11px]">
                                {b.toString(16).toUpperCase().padStart(2, '0')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogIndex(idx);
                            }}
                            className="px-2 py-0.5 bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white rounded text-[10px] font-sans"
                          >
                            Set as Event Center
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* Value Correlation Modal */}
      {correlatingFrame && (
        <ValueCorrelationModal
          isOpen={isCorrelatorOpen}
          onClose={() => setIsCorrelatorOpen(false)}
          commandFrame={correlatingFrame}
          commandByteIdx={correlatingByteIdx}
          allFrames={frames}
        />
      )}
    </div>
  );
};
