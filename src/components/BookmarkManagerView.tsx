import React, { useState } from 'react';
import { 
  Bookmark as BookmarkIcon, Plus, Trash2, Clock, Tag, Shield, 
  Zap, Radio, Filter, ArrowRight, CheckCircle2, AlertCircle, Sparkles, Download
} from 'lucide-react';
import { Bookmark, CANFrame } from '../types';

export interface AutoArmConfig {
  enabled: boolean;
  autoDisableOnTrigger: boolean;
  deltaWindowMs: number;
  triggerCondition: 'any_new_id' | 'payload_change' | 'manual';
}

interface BookmarkManagerViewProps {
  bookmarks: Bookmark[];
  onAddBookmark: (title?: string, description?: string, triggerMode?: 'Manual' | 'Shortcut' | 'Auto-Armed') => Bookmark;
  onDeleteBookmark: (id: string) => void;
  onClearBookmarks: () => void;
  autoArm: AutoArmConfig;
  setAutoArm: React.Dispatch<React.SetStateAction<AutoArmConfig>>;
  frames: CANFrame[];
  onSelectFilterId?: (id: string) => void;
}

export const BookmarkManagerView: React.FC<BookmarkManagerViewProps> = ({
  bookmarks,
  onAddBookmark,
  onDeleteBookmark,
  onClearBookmarks,
  autoArm,
  setAutoArm,
  frames,
  onSelectFilterId
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);

  const currentTimestamp = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAddBookmark(newTitle || undefined, newDesc || undefined, 'Manual');
    setNewTitle('');
    setNewDesc('');
  };

  const handleToggleAutoArm = () => {
    setAutoArm(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  };

  const handleExportBookmarks = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bookmarks, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `savvylens_bookmarks_${Date.now()}.json`);
    dlAnchorElem.click();
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Header with SavvyLens Originator Attribution */}
        <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
                <BookmarkIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-white">SavvyLens Event Bookmarks & Temporal Correlation</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    Timeline Engine
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Instant keyboard shortcuts [B], Auto-Arm / Auto-Disable triggers, and temporal delta-window correlation of concurrent CAN IDs.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => onAddBookmark(undefined, undefined, 'Manual')}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Drop Bookmark Now (+{currentTimestamp.toFixed(2)}s)</span>
            </button>
            {bookmarks.length > 0 && (
              <button
                onClick={handleExportBookmarks}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Export</span>
              </button>
            )}
          </div>
        </div>

        {/* SavvyLens Auto-Arm & Shortcut Control Deck */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Quick Shortcut Card */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Global Shortcut</span>
                </span>
                <span className="text-[11px] font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-700 text-blue-400 font-bold">
                  Key: [B]
                </span>
              </div>
              <p className="text-xs text-slate-400 pt-1">
                Press <strong className="text-slate-200">B</strong> anywhere in SavvyLens to instantaneously drop a timeline bookmark without taking your hands off vehicle testing.
              </p>
            </div>
            <div className="mt-3 text-[11px] text-slate-500 flex items-center space-x-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Current Bus Time: +{currentTimestamp.toFixed(3)}s</span>
            </div>
          </div>

          {/* Auto-Arm / Auto-Disable Subsystem */}
          <div className={`border rounded-2xl p-4 flex flex-col justify-between transition ${
            autoArm.enabled 
              ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm' 
              : 'bg-slate-900 border-slate-800/80'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Radio className={`w-4 h-4 ${autoArm.enabled ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                  <span>SavvyLens Auto-Arm Engine</span>
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  autoArm.enabled 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {autoArm.enabled ? 'ARMED' : 'DISARMED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 pt-1">
                Arms SavvyLens to automatically capture a bookmark the moment physical vehicle actuation causes traffic bursts.
              </p>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/80">
              <label className="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoArm.autoDisableOnTrigger}
                  onChange={e => setAutoArm(prev => ({ ...prev, autoDisableOnTrigger: e.target.checked }))}
                  className="rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-0"
                />
                <span>Auto-Disable on Fire</span>
              </label>
              <button
                onClick={handleToggleAutoArm}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  autoArm.enabled 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {autoArm.enabled ? 'Disarm' : 'Arm Detector'}
              </button>
            </div>
          </div>

          {/* Temporal Delta Correlation Window */}
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Zap className="w-4 h-4 text-blue-400" />
                <span>Correlation Delta Window (±Δt)</span>
              </span>
              <p className="text-xs text-slate-400 pt-1">
                Time window around each bookmark to scan for newly introduced CAN IDs and concurrent payload mutations.
              </p>
            </div>

            <div className="mt-3 flex items-center space-x-1.5 pt-2 border-t border-slate-800/80">
              {[100, 250, 500, 1000].map(ms => (
                <button
                  key={ms}
                  onClick={() => setAutoArm(prev => ({ ...prev, deltaWindowMs: ms }))}
                  className={`flex-1 py-1 rounded-lg text-[11px] font-mono transition font-medium border ${
                    autoArm.deltaWindowMs === ms
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  ±{ms}ms
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Split Layout: Add Bookmark + Recorded List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Custom Annotation Form */}
          <form onSubmit={handleManualAdd} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 h-fit">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>Annotate Physical Event</span>
            </h3>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Event Title</label>
              <input
                type="text"
                placeholder="e.g. Turn Signal Left Activated"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Observation Notes</label>
              <textarea
                placeholder="Physical pedal depressed or actuator triggered..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 h-24 resize-none focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
            >
              Record Bookmark at +{currentTimestamp.toFixed(2)}s
            </button>
          </form>

          {/* Bookmarks Timeline & Recorded CAN IDs */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
                  <span>Recorded Event Timeline</span>
                  <span className="text-[11px] bg-slate-800 px-2 py-0.5 rounded-full text-blue-400 font-mono">
                    {bookmarks.length}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Select a bookmark to inspect novel CAN IDs that transmitted at the exact moment of physical vehicle action.
                </p>
              </div>

              {bookmarks.length > 0 && (
                <button
                  onClick={onClearBookmarks}
                  className="text-xs text-slate-400 hover:text-rose-400 transition"
                >
                  Clear All
                </button>
              )}
            </div>

            {bookmarks.length === 0 ? (
              <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                <BookmarkIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-300">No event bookmarks recorded yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Use the <strong className="text-slate-300">[B]</strong> keyboard shortcut, arm the Auto-Arm detector, or click "Drop Bookmark" to record vehicle actions and correlate concurrent CAN IDs.
                </p>
              </div>
            ) : (
              <div className="space-y-3 overflow-auto max-h-[600px] pr-1">
                {bookmarks.map((bm) => {
                  const isSelected = selectedBookmark?.id === bm.id;
                  const hasNewIds = bm.newIdsDetected && bm.newIdsDetected.length > 0;

                  return (
                    <div 
                      key={bm.id}
                      onClick={() => setSelectedBookmark(bm)}
                      className={`bg-slate-950 border rounded-xl p-4 transition cursor-pointer ${
                        isSelected 
                          ? 'border-blue-500/60 bg-blue-950/15 ring-1 ring-blue-500/30' 
                          : 'border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1.5 flex-1 pr-4">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded font-mono text-xs font-bold">
                              +{bm.timestamp.toFixed(3)}s
                            </span>
                            <span className="font-bold text-sm text-white">{bm.title}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              bm.triggerMode === 'Shortcut'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : bm.triggerMode === 'Auto-Armed'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {bm.triggerMode}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">±{bm.deltaWindowMs || 500}ms window</span>
                          </div>

                          <p className="text-xs text-slate-300">{bm.description}</p>

                          {/* SavvyLens Correlated CAN IDs */}
                          <div className="pt-2">
                            <div className="text-[11px] font-medium text-slate-400 mb-1 flex items-center justify-between">
                              <span className="flex items-center space-x-1">
                                <Zap className="w-3 h-3 text-amber-400" />
                                <span>New CAN IDs Recorded At Event:</span>
                              </span>
                              {hasNewIds && (
                                <span className="text-[10px] text-emerald-400 font-mono">
                                  {bm.newIdsDetected.length} novel ID(s)
                                </span>
                              )}
                            </div>

                            {hasNewIds ? (
                              <div className="flex flex-wrap gap-1.5">
                                {bm.newIdsDetected.map(id => (
                                  <button
                                    key={id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onSelectFilterId) onSelectFilterId(id);
                                    }}
                                    className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono text-xs font-bold flex items-center space-x-1 transition"
                                    title="Click to filter Sniffer to this CAN ID"
                                  >
                                    <span>{id}</span>
                                    <Filter className="w-3 h-3 ml-0.5 text-amber-400" />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 italic bg-slate-900/60 px-2.5 py-1.5 rounded border border-slate-800/60">
                                No newly introduced IDs in ±{bm.deltaWindowMs || 500}ms window. (Existing periodic broadcast IDs were active).
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteBookmark(bm.id);
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition shrink-0"
                          title="Delete bookmark"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
