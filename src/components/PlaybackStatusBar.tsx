import React from 'react';
import { Play, Pause, RotateCcw, FastForward, Rewind, Shield, Radio, CheckCircle } from 'lucide-react';
import { ConnectionConfig, CANFrame } from '../types';

interface PlaybackStatusBarProps {
  connections: ConnectionConfig[];
  isCapturing: boolean;
  setIsCapturing: (val: boolean) => void;
  frameCount: number;
  frames?: CANFrame[];
  playbackTime?: number;
  setPlaybackTime?: (val: number | ((prev: number) => number)) => void;
  isPlaybackActive?: boolean;
  setIsPlaybackActive?: (val: boolean | ((prev: boolean) => boolean)) => void;
  playbackSpeed?: number;
  setPlaybackSpeed?: (spd: number) => void;
  onStepFrame?: (direction: 'forward' | 'backward') => void;
  onJumpToStart?: () => void;
  onJumpToEnd?: () => void;
}

export const PlaybackStatusBar: React.FC<PlaybackStatusBarProps> = ({
  connections,
  isCapturing,
  setIsCapturing,
  frameCount,
  frames = [],
  playbackTime = 0,
  setPlaybackTime,
  isPlaybackActive = false,
  setIsPlaybackActive,
  playbackSpeed = 1,
  setPlaybackSpeed,
  onStepFrame,
  onJumpToStart,
  onJumpToEnd
}) => {
  const activeConn = connections.find(c => c.status === 'Connected') || connections[0];
  
  const minTime = frames.length > 0 ? frames[0].timestamp : 0;
  const maxTime = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;
  const displayCurrentTime = isCapturing ? maxTime : playbackTime;

  const handleTogglePlay = () => {
    if (isCapturing) return;
    if (setIsPlaybackActive) {
      setIsPlaybackActive(prev => !prev);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isCapturing || !setPlaybackTime) return;
    const val = Number(e.target.value);
    setPlaybackTime(val);
  };

  return (
    <footer className="h-12 bg-slate-950 border-t border-slate-800/80 px-4 flex items-center justify-between text-xs text-slate-300 shrink-0 select-none z-30">
      {/* Left connection & status */}
      <div className="flex items-center space-x-4 min-w-[240px]">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${activeConn?.status === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-semibold text-white truncate max-w-[120px]">{activeConn ? activeConn.name : 'No Connection'}</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="font-mono text-slate-400">
          Bitrate: <span className="text-white font-medium">500 kbps</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="font-mono text-slate-400">
          Frames: <span className="text-white font-medium">{frameCount.toLocaleString()}</span>
        </div>
      </div>

      {/* Center Media Editing Scrubber / Playback Bar */}
      <div className="flex items-center space-x-3 w-[520px] max-w-full">
        {/* Jump to Start */}
        <button
          onClick={onJumpToStart}
          disabled={isCapturing || frames.length === 0}
          className={`p-1.5 rounded-lg transition ${
            isCapturing || frames.length === 0
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer'
          }`}
          title={isCapturing ? "Playback disabled while capturing" : "Jump to Trace Start (0.00s)"}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Step Backward */}
        <button
          onClick={() => onStepFrame && onStepFrame('backward')}
          disabled={isCapturing || frames.length === 0}
          className={`p-1.5 rounded-lg transition ${
            isCapturing || frames.length === 0
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer'
          }`}
          title={isCapturing ? "Playback disabled while capturing" : "Step Backward 1 Frame"}
        >
          <Rewind className="w-3.5 h-3.5" />
        </button>

        {/* Play/Pause Button */}
        <button
          onClick={handleTogglePlay}
          disabled={isCapturing || frames.length === 0}
          className={`p-2 rounded-xl transition flex items-center justify-center ${
            isCapturing || frames.length === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
              : isPlaybackActive
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-sm cursor-pointer'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm cursor-pointer'
          }`}
          title={
            isCapturing
              ? 'Playback is disabled during live capture. Pause Capture to scrub or replay.'
              : isPlaybackActive
                ? 'Pause Replay'
                : 'Start Trace Replay (Read-only, no re-recording)'
          }
        >
          {isPlaybackActive ? (
            <Pause className="w-3.5 h-3.5 fill-white" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-white" />
          )}
        </button>

        {/* Step Forward */}
        <button
          onClick={() => onStepFrame && onStepFrame('forward')}
          disabled={isCapturing || frames.length === 0}
          className={`p-1.5 rounded-lg transition ${
            isCapturing || frames.length === 0
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-white hover:bg-slate-900 cursor-pointer'
          }`}
          title={isCapturing ? "Playback disabled while capturing" : "Step Forward 1 Frame"}
        >
          <FastForward className="w-3.5 h-3.5" />
        </button>

        {/* Scrubber Slider & Timing */}
        <div className="flex-1 flex flex-col space-y-1">
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>+{displayCurrentTime.toFixed(2)}s</span>
            {isCapturing ? (
              <span className="text-amber-400/90 font-medium flex items-center space-x-1" title="Live CAN bus capture is actively recording into the buffer">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                <span>Live Capture (Playback Locked)</span>
              </span>
            ) : (
              <span className="text-blue-400 font-bold">
                {isPlaybackActive ? `${playbackSpeed}x Replay (Read-only)` : 'Scrubber (Paused)'}
              </span>
            )}
            <span>+{maxTime.toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={minTime}
            max={maxTime || 1}
            step={0.01}
            disabled={isCapturing || frames.length === 0}
            value={displayCurrentTime}
            onChange={handleSliderChange}
            className={`w-full h-1.5 rounded-lg ${
              isCapturing || frames.length === 0
                ? 'bg-slate-800 accent-slate-600 cursor-not-allowed opacity-50'
                : 'accent-blue-500 bg-slate-900 cursor-pointer'
            }`}
            title={isCapturing ? "Pause Capture above to scrub the recorded trace" : "Scrub through recorded CAN timeline"}
          />
        </div>

        {/* Speed Selector */}
        <div className="flex items-center space-x-1">
          {[0.5, 1, 2, 5].map(spd => (
            <button
              key={spd}
              onClick={() => setPlaybackSpeed && setPlaybackSpeed(spd)}
              disabled={isCapturing || frames.length === 0}
              className={`px-1.5 py-1 rounded text-[10px] font-mono font-bold transition ${
                isCapturing || frames.length === 0
                  ? 'text-slate-600 cursor-not-allowed'
                  : playbackSpeed === spd
                    ? 'bg-blue-600/30 text-blue-400 border border-blue-500/30 cursor-pointer'
                    : 'text-slate-400 hover:text-white cursor-pointer'
              }`}
              title={`Set playback speed to ${spd}x`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* Right system info & status */}
      <div className="flex items-center space-x-4 font-mono text-[11px] text-slate-400">
        <div>
          Status:{' '}
          <span className={isCapturing ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
            {isCapturing ? 'Recording' : 'Paused'}
          </span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="text-emerald-400 flex items-center space-x-1">
          <Shield className="w-3.5 h-3.5" />
          <span>Buffer OK</span>
        </div>
      </div>
    </footer>
  );
};
