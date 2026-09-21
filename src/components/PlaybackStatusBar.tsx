import React, { useState } from 'react';
import { Play, Pause, RotateCcw, FastForward, Rewind, Film, Volume2, Shield } from 'lucide-react';
import { ConnectionConfig } from '../types';

interface PlaybackStatusBarProps {
  connections: ConnectionConfig[];
  isCapturing: boolean;
  setIsCapturing: (val: boolean) => void;
  frameCount: number;
}

export const PlaybackStatusBar: React.FC<PlaybackStatusBarProps> = ({
  connections,
  isCapturing,
  setIsCapturing,
  frameCount
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(42.5);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const activeConn = connections.find(c => c.status === 'Connected') || connections[0];

  return (
    <footer className="h-12 bg-slate-950 border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-300 shrink-0 select-none z-30">
      {/* Left connection & status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${activeConn?.status === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-semibold text-white">{activeConn ? activeConn.name : 'No Connection'}</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="font-mono text-slate-400">
          Bitrate: <span className="text-white font-medium">500 kbps</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="font-mono text-slate-400">
          Frames: <span className="text-white font-medium">{frameCount + 1420}</span>
        </div>
      </div>

      {/* Center Media Editing Scrubber / Playback Bar */}
      <div className="flex items-center space-x-3 w-[450px]">
        <button
          onClick={() => setCurrentTime(0)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition"
          title="Jump to Start"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition flex items-center justify-center"
          title={isPlaying ? 'Pause Playback' : 'Start Playback'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-white" /> : <Play className="w-3.5 h-3.5 fill-white" />}
        </button>

        <div className="flex-1 flex flex-col space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>+{currentTime.toFixed(2)}s</span>
            <span className="text-blue-400 font-bold">{isPlaying ? `${playbackSpeed}x Replay` : 'Scrubber'}</span>
            <span>120.00s</span>
          </div>
          <input
            type="range"
            min={0}
            max={120}
            step={0.1}
            value={currentTime}
            onChange={e => setCurrentTime(Number(e.target.value))}
            className="w-full accent-blue-500 bg-slate-900 h-1.5 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex items-center space-x-1">
          {[0.5, 1, 2].map(spd => (
            <button
              key={spd}
              onClick={() => setPlaybackSpeed(spd)}
              className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition ${
                playbackSpeed === spd ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Right system info */}
      <div className="flex items-center space-x-4 font-mono text-[11px] text-slate-400">
        <div>CPU: <span className="text-white">2.4%</span></div>
        <span className="text-slate-600">|</span>
        <div>Uptime: <span className="text-white">00:14:22</span></div>
        <span className="text-slate-600">|</span>
        <div className="text-emerald-400 flex items-center space-x-1">
          <Shield className="w-3.5 h-3.5" />
          <span>Secure</span>
        </div>
      </div>
    </footer>
  );
};
