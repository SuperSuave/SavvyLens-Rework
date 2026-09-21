import React, { useState, useMemo } from 'react';
import { 
  X, GitMerge, Clock, Search, ArrowRight, Shield, Zap, Sparkles, Check, Bookmark
} from 'lucide-react';
import { CANFrame, ValueCorrelationMatch } from '../types';
import { correlateCommandToState } from '../utils/baselineAnalysis';

interface ValueCorrelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  commandFrame: CANFrame;
  commandByteIdx: number;
  allFrames: CANFrame[];
  onSelectStateFrame?: (frame: CANFrame) => void;
}

export const ValueCorrelationModal: React.FC<ValueCorrelationModalProps> = ({
  isOpen,
  onClose,
  commandFrame,
  commandByteIdx,
  allFrames,
  onSelectStateFrame
}) => {
  const [windowMs, setWindowMs] = useState<number>(350);
  const [customValueHex, setCustomValueHex] = useState<string>(
    commandFrame.data[commandByteIdx]?.toString(16).toUpperCase().padStart(2, '0') || '00'
  );
  const [pinnedMatches, setPinnedMatches] = useState<Set<string>>(new Set());

  // Current target value to correlate
  const targetByteVal = useMemo(() => {
    const parsed = parseInt(customValueHex, 16);
    return isNaN(parsed) ? commandFrame.data[commandByteIdx] || 0 : parsed;
  }, [customValueHex, commandFrame, commandByteIdx]);

  // Run correlation engine
  const matches = useMemo(() => {
    return correlateCommandToState(
      commandFrame,
      commandByteIdx,
      allFrames,
      targetByteVal,
      windowMs
    );
  }, [commandFrame, commandByteIdx, allFrames, targetByteVal, windowMs]);

  if (!isOpen) return null;

  const hexVal = targetByteVal.toString(16).toUpperCase().padStart(2, '0');

  const togglePin = (key: string) => {
    setPinnedMatches(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Value Echo & Command ↔ State Correlator</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                  E-GMP Pattern
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Linking trigger/command byte to lagging actuator feedback and state echo messages
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Command Context Bar */}
        <div className="px-6 py-3 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center space-x-3">
            <span className="text-slate-400">Command Frame:</span>
            <span className="font-mono font-bold text-blue-400 bg-blue-950/60 px-2 py-1 rounded-lg border border-blue-800/40">
              {commandFrame.id} {commandFrame.name ? `(${commandFrame.name})` : ''}
            </span>
            <span className="text-slate-500">at</span>
            <span className="font-mono text-slate-300">+{commandFrame.timestamp.toFixed(4)}s</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">Target Byte:</span>
            <span className="font-mono font-bold text-amber-400 bg-amber-950/50 px-2 py-1 rounded-lg border border-amber-800/40">
              Byte D{commandByteIdx + 1}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400">Target Value (Hex):</span>
              <input
                type="text"
                value={customValueHex}
                onChange={(e) => setCustomValueHex(e.target.value.toUpperCase().slice(0, 2))}
                className="w-14 bg-slate-900 border border-slate-700 text-white px-2 py-1 rounded font-mono text-center font-bold text-xs focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Window:</span>
              <select
                value={windowMs}
                onChange={(e) => setWindowMs(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-white px-2 py-1 rounded text-xs focus:outline-hidden"
              >
                <option value={150}>+150 ms (Fast feedback)</option>
                <option value={350}>+350 ms (Standard)</option>
                <option value={750}>+750 ms (Slow CAN/LIN)</option>
                <option value={1500}>+1500 ms (Extended)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1 border-b border-slate-800/60">
            <span className="font-semibold text-slate-300">
              Correlated State Candidates ({matches.length} found with value 0x{hexVal})
            </span>
            <span>Search window: +0ms to +{windowMs}ms</span>
          </div>

          {matches.length === 0 ? (
            <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800/50">
              <p className="text-sm font-medium text-slate-400">No other CAN IDs echoed value 0x{hexVal} in the +{windowMs}ms window.</p>
              <p className="text-xs text-slate-500 mt-1">
                Try widening the window or selecting another command byte.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {matches.map((match) => {
                const key = `${match.canId}_D${match.byteIndex}`;
                const isPinned = pinnedMatches.has(key);
                const isHighConfidence = match.score >= 80;

                return (
                  <div
                    key={key}
                    className={`p-4 rounded-xl border transition-all ${
                      isPinned 
                        ? 'bg-blue-950/40 border-blue-500/60 shadow-md' 
                        : isHighConfidence
                        ? 'bg-slate-900/90 border-slate-700/80 hover:border-blue-500/40'
                        : 'bg-slate-950/50 border-slate-800/60 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg font-mono font-bold text-sm ${
                          isHighConfidence ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {match.canId}
                        </div>

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">
                              {match.frameName || 'State / Feedback ECU'}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                              match.candidateRole === 'state' 
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                                : 'bg-slate-800 text-slate-300'
                            }`}>
                              {match.candidateRole === 'state' ? 'Authoritative State' : 'Echo'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 mt-1">
                            <span>Byte: <strong className="text-amber-400">D{match.byteIndex + 1}</strong></span>
                            <span>•</span>
                            <span>Value: <strong className="text-white">0x{match.byteValue.toString(16).toUpperCase().padStart(2, '0')}</strong></span>
                            <span>•</span>
                            <span className="flex items-center text-slate-300">
                              <Clock className="w-3 h-3 mr-1 text-slate-500" />
                              +{match.timeDeltaMs} ms after command
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        {/* Confidence Score Pill */}
                        <div className="text-right">
                          <div className="text-[10px] text-slate-500 uppercase font-semibold">Confidence</div>
                          <div className={`text-base font-bold font-mono ${
                            match.score >= 80 ? 'text-emerald-400' : match.score >= 50 ? 'text-amber-400' : 'text-slate-400'
                          }`}>
                            {match.score}%
                          </div>
                        </div>

                        {/* Action buttons */}
                        <button
                          onClick={() => togglePin(key)}
                          className={`p-2 rounded-lg border text-xs font-medium transition flex items-center space-x-1 ${
                            isPinned
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          }`}
                          title="Pin pair as verified Command ↔ State link"
                        >
                          <Bookmark className="w-4 h-4" />
                          <span className="hidden sm:inline">{isPinned ? 'Linked' : 'Link Pair'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Architectural Explanation */}
                    <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center space-x-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>
                          {commandFrame.id} D{commandByteIdx + 1} (Cmd: 0x{hexVal}) ➔ {match.canId} D{match.byteIndex + 1} (State: 0x{hexVal}) lagged by {match.timeDeltaMs}ms
                        </span>
                      </div>
                      <span className="text-slate-500">Matches E-GMP HVAC & Drive Mode architecture</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Clicking &quot;Link Pair&quot; tracks this Command ↔ State relationship across sessions.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
