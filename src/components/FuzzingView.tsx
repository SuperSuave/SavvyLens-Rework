import React, { useState } from 'react';
import { Zap, Play, Square, AlertTriangle, ShieldAlert } from 'lucide-react';

export const FuzzingView: React.FC = () => {
  const [startId, setStartId] = useState('0x300');
  const [endId, setEndId] = useState('0x3FF');
  const [delayMs, setDelayMs] = useState(5);
  const [burstRate, setBurstRate] = useState(1);
  const [isFuzzing, setIsFuzzing] = useState(false);
  const [fuzzCount, setFuzzCount] = useState(0);
  const [bitGrid, setBitGrid] = useState<boolean[]>(Array(64).fill(false));

  const toggleBit = (index: number) => {
    setBitGrid(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <span>CAN Bus Fuzzing & Bit Sweeper</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Shotgun fuzzing and bit-sweep analysis for reverse engineering undocumented ECU control frames</p>
          </div>

          <button
            onClick={() => setIsFuzzing(!isFuzzing)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm ${
              isFuzzing ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse' : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {isFuzzing ? <Square className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
            <span>{isFuzzing ? 'STOP FUZZING (SAFETY)' : 'Start Fuzzing'}</span>
          </button>
        </div>

        <div className="bg-rose-950/30 border border-rose-900/50 p-4 rounded-2xl flex items-center space-x-3 text-xs text-rose-300">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <span className="font-bold">Safety Warning:</span> Fuzzing can transmit unintended commands to vehicle ECUs. Ensure the vehicle is on a lift or in a safe stationary state before starting transmission.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-300">Fuzzing Parameters</h3>

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Delay (ms)</label>
                <input
                  type="number"
                  value={delayMs}
                  onChange={e => setDelayMs(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Burst Rate</label>
                <input
                  type="number"
                  value={burstRate}
                  onChange={e => setBurstRate(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 block">Transmission Counter</span>
              <span className="text-lg font-mono font-bold text-amber-400">{isFuzzing ? fuzzCount + Math.floor(Math.random() * 50) : fuzzCount} frames</span>
            </div>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300">8x8 Bit Fuzzing Matrix (Bytes 0-7)</h3>
              <span className="text-[11px] text-slate-400">Click cells to toggle bit state (Green = Fuzzed)</span>
            </div>

            <div className="grid grid-cols-8 gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
              {bitGrid.map((active, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleBit(idx)}
                  className={`h-10 rounded-lg font-mono text-xs font-bold transition flex items-center justify-center ${
                    active
                      ? 'bg-emerald-600 text-white shadow-sm border border-emerald-400'
                      : 'bg-slate-900 text-slate-500 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {idx}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <span>Active Bits: {bitGrid.filter(Boolean).length} / 64</span>
              <button
                onClick={() => setBitGrid(Array(64).fill(false))}
                className="text-slate-400 hover:text-white underline text-xs"
              >
                Clear All Bits
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
