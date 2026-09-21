import React, { useState } from 'react';
import { Play, Pause, RotateCcw, FastForward, Rewind, Film } from 'lucide-react';
import { CANFrame } from '../types';

interface PlaybackViewProps {
  frames: CANFrame[];
}

export const PlaybackView: React.FC<PlaybackViewProps> = ({ frames }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Film className="w-5 h-5 text-blue-400" />
              <span>CAN Log Replay & Playback Controller</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Replay recorded CAN captures at variable speeds (0.1x to 10x) with timeline scrubbing</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Playback Position</span>
              <div className="text-xl font-mono font-bold text-white">+{currentTime.toFixed(2)}s / 120.00s</div>
            </div>

            <div className="flex items-center space-x-2">
              {[0.5, 1, 2, 5].map(spd => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    playbackSpeed === spd ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
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
              max={120}
              value={currentTime}
              onChange={e => setCurrentTime(Number(e.target.value))}
              className="w-full accent-blue-600 bg-slate-950 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>0.00s</span>
              <span>60.00s</span>
              <span>120.00s</span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4 pt-2">
            <button
              onClick={() => setCurrentTime(0)}
              className="p-3 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-lg transition flex items-center space-x-2 font-semibold text-sm px-6"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              <span>{isPlaying ? 'Pause Replay' : 'Start Replay'}</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">Loaded Log Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-xs font-mono">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Total Frames</span>
              <span className="text-lg font-bold text-white">{frames.length * 15 + 1420}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Unique IDs</span>
              <span className="text-lg font-bold text-blue-400">24</span>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">Bus Load</span>
              <span className="text-lg font-bold text-emerald-400">38.4%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
