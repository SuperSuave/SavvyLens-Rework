import React, { useState } from 'react';
import { 
  Bookmark as BookmarkIcon, Plus, Trash2, Clock, Tag, Shield, 
  Zap, Radio, Filter, ArrowRight, CheckCircle2, AlertCircle, Sparkles, Download,
  Sliders, Settings, Disc, Play, Check, Crosshair
} from 'lucide-react';
import { Bookmark, CANFrame, CANMessageTrigger } from '../types';

export interface AutoArmConfig {
  enabled: boolean;
  autoDisableOnTrigger: boolean;
  deltaWindowMs: number;
  triggerCondition: 'any_new_id' | 'payload_change' | 'manual';
}

interface BookmarkManagerViewProps {
  bookmarks: Bookmark[];
  onAddBookmark: (
    title?: string, 
    description?: string, 
    triggerMode?: 'Manual' | 'Shortcut' | 'Auto-Armed' | 'CAN-Triggered',
    extraData?: Partial<Bookmark>
  ) => Bookmark;
  onDeleteBookmark: (id: string) => void;
  onClearBookmarks: () => void;
  autoArm: AutoArmConfig;
  setAutoArm: React.Dispatch<React.SetStateAction<AutoArmConfig>>;
  frames: CANFrame[];
  onSelectFilterId?: (id: string) => void;
  canTriggers: CANMessageTrigger[];
  setCanTriggers: React.Dispatch<React.SetStateAction<CANMessageTrigger[]>>;
  onSimulateCanTrigger: (trigger: CANMessageTrigger) => void;
}

export const BookmarkManagerView: React.FC<BookmarkManagerViewProps> = ({
  bookmarks,
  onAddBookmark,
  onDeleteBookmark,
  onClearBookmarks,
  autoArm,
  setAutoArm,
  frames,
  onSelectFilterId,
  canTriggers,
  setCanTriggers,
  onSimulateCanTrigger
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedBookmark, setSelectedBookmark] = useState<Bookmark | null>(null);

  // New Trigger Form State
  const [isAddingTrigger, setIsAddingTrigger] = useState(false);
  const [triggerName, setTriggerName] = useState('Steering Wheel Button');
  const [triggerCanId, setTriggerCanId] = useState('0x156');
  const [targetByte, setTargetByte] = useState<number>(1); // 1 to 8 (D1 to D8)
  const [triggerCondition, setTriggerCondition] = useState<'equals' | 'mask_set' | 'changed' | 'any_message'>('equals');
  const [expectedHex, setExpectedHex] = useState('0x24');
  const [maskHex, setMaskHex] = useState('0xFF');
  const [triggerAutoDisable, setTriggerAutoDisable] = useState(false);
  const [triggerCooldownMs, setTriggerCooldownMs] = useState(800);

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

  const handleToggleTrigger = (id: string) => {
    setCanTriggers(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  const handleDeleteTrigger = (id: string) => {
    setCanTriggers(prev => prev.filter(t => t.id !== id));
  };

  const handleCreateTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = triggerCanId.startsWith('0x') || triggerCanId.startsWith('0X') 
      ? triggerCanId 
      : `0x${triggerCanId}`;
    
    const newTrig: CANMessageTrigger = {
      id: 'trig-' + Date.now(),
      name: triggerName.trim() || 'Mapped CAN Trigger',
      enabled: true,
      canId: cleanId,
      targetByte, // 1 to 8 (D1 to D8) or 0 for Any
      condition: triggerCondition,
      expectedHex: expectedHex.startsWith('0x') ? expectedHex : `0x${expectedHex}`,
      maskHex: maskHex.startsWith('0x') ? maskHex : `0x${maskHex}`,
      autoDisableOnTrigger: triggerAutoDisable,
      cooldownMs: triggerCooldownMs,
      notes: `Targeting CAN ID ${cleanId} on Byte ${targetByte === 0 ? 'Any' : `D${targetByte}`}`
    };

    setCanTriggers(prev => [...prev, newTrig]);
    setIsAddingTrigger(false);
  };

  const applyTriggerPreset = (name: string, canId: string, byteNum: number, condition: 'equals' | 'mask_set' | 'changed' | 'any_message', hex: string) => {
    setTriggerName(name);
    setTriggerCanId(canId);
    setTargetByte(byteNum);
    setTriggerCondition(condition);
    setExpectedHex(hex);
    setIsAddingTrigger(true);
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
                  <h2 className="text-lg font-bold text-white">SavvyLens Event Bookmarks & CAN Trigger Sync</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    Timeline Engine
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Map known CAN messages (e.g. steering wheel buttons, pedals) to trigger bookmarks, plus key shortcuts [B] and Auto-Arm temporal delta correlation.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => onAddBookmark(undefined, undefined, 'Manual')}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Drop Bookmark Now (+{currentTimestamp.toFixed(2)}s)</span>
            </button>
            {bookmarks.length > 0 && (
              <button
                onClick={handleExportBookmarks}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center space-x-1.5 border border-slate-700 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Export</span>
              </button>
            )}
          </div>
        </div>

        {/* Control Deck: 3 System Modules */}
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
                Arms SavvyLens to automatically capture a bookmark the moment physical vehicle actuation introduces new CAN IDs.
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
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
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
                  className={`flex-1 py-1 rounded-lg text-[11px] font-mono transition font-medium border cursor-pointer ${
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

        {/* SECTION: Mapped CAN Message Triggers (Steering Wheel / Button Sync) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
                  <Crosshair className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Mapped CAN Message Triggers (Steering Wheel & Sensor Sync)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {canTriggers.filter(t => t.enabled).length} Active
                  </span>
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Map specific CAN messages (e.g. steering wheel button push, pedal switch) to automatically drop and sync bookmarks when incoming frames match.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsAddingTrigger(!isAddingTrigger)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingTrigger ? 'Close Builder' : 'Map New CAN Trigger'}</span>
              </button>
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-500 font-medium whitespace-nowrap text-[11px]">Quick Presets:</span>
            <button
              onClick={() => applyTriggerPreset('Steering Wheel Button', '0x156', 1, 'equals', '0x24')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-indigo-300 rounded-lg border border-slate-800 text-[11px] whitespace-nowrap transition cursor-pointer"
            >
              Steering Wheel Button (0x156 • Byte D1=0x24)
            </button>
            <button
              onClick={() => applyTriggerPreset('Brake Switch Closed', '0x201', 4, 'equals', '0x02')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-indigo-300 rounded-lg border border-slate-800 text-[11px] whitespace-nowrap transition cursor-pointer"
            >
              Brake Pedal Switch (0x201 • Byte D4=0x02)
            </button>
            <button
              onClick={() => applyTriggerPreset('Turn Signal Stalk Left', '0x180', 2, 'equals', '0x10')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-indigo-300 rounded-lg border border-slate-800 text-[11px] whitespace-nowrap transition cursor-pointer"
            >
              Turn Signal Stalk (0x180 • Byte D2=0x10)
            </button>
            <button
              onClick={() => applyTriggerPreset('ABS Pulse Flag', '0x320', 5, 'equals', '0x01')}
              className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-indigo-300 rounded-lg border border-slate-800 text-[11px] whitespace-nowrap transition cursor-pointer"
            >
              ABS Pulse Event (0x320 • Byte D5=0x01)
            </button>
          </div>

          {/* Add / Edit CAN Trigger Form */}
          {isAddingTrigger && (
            <form onSubmit={handleCreateTrigger} className="bg-slate-950 p-4 rounded-xl border border-indigo-500/30 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-indigo-300 flex items-center space-x-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Configure CAN Message Trigger Mapping</span>
                </span>
                <span className="text-[11px] text-slate-400">Bytes evaluated as D1 through D8</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Trigger / Button Name</label>
                  <input
                    type="text"
                    value={triggerName}
                    onChange={e => setTriggerName(e.target.value)}
                    placeholder="e.g. Steering Wheel Cruise Button"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">CAN ID (Hex)</label>
                  <input
                    type="text"
                    value={triggerCanId}
                    onChange={e => setTriggerCanId(e.target.value)}
                    placeholder="e.g. 0x156 or 156"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Target Byte (D1–D8)</label>
                  <select
                    value={targetByte}
                    onChange={e => setTargetByte(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value={1}>Byte D1 (First Byte)</option>
                    <option value={2}>Byte D2</option>
                    <option value={3}>Byte D3</option>
                    <option value={4}>Byte D4</option>
                    <option value={5}>Byte D5</option>
                    <option value={6}>Byte D6</option>
                    <option value={7}>Byte D7</option>
                    <option value={8}>Byte D8 (Last Byte)</option>
                    <option value={0}>Any Byte (Any Message on ID)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Match Condition</label>
                  <select
                    value={triggerCondition}
                    onChange={e => setTriggerCondition(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="equals">Byte Equals Expected Value</option>
                    <option value="mask_set">Bitmask Match (AND != 0)</option>
                    <option value="changed">Byte Mutated / Changed</option>
                    <option value="any_message">Any Frame on this ID</option>
                  </select>
                </div>
              </div>

              {triggerCondition !== 'any_message' && triggerCondition !== 'changed' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Expected Hex Value</label>
                    <input
                      type="text"
                      value={expectedHex}
                      onChange={e => setExpectedHex(e.target.value)}
                      placeholder="e.g. 0x24 or 01"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Bitmask (Optional, Hex)</label>
                    <input
                      type="text"
                      value={maskHex}
                      onChange={e => setMaskHex(e.target.value)}
                      placeholder="e.g. 0xFF or 0x01"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Debounce / Cooldown (ms)</label>
                    <input
                      type="number"
                      value={triggerCooldownMs}
                      onChange={e => setTriggerCooldownMs(Number(e.target.value))}
                      placeholder="800"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={triggerAutoDisable}
                    onChange={e => setTriggerAutoDisable(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-0"
                  />
                  <span>Disarm after 1 trigger (One-shot)</span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingTrigger(false)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-sm"
                  >
                    Save CAN Trigger
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Active Mapped Triggers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {canTriggers.map(trig => {
              const byteDisplay = trig.targetByte === 0 ? 'Any Byte' : `Byte D${trig.targetByte}`;
              return (
                <div 
                  key={trig.id}
                  className={`p-3.5 rounded-xl border transition flex flex-col justify-between ${
                    trig.enabled 
                      ? 'bg-slate-950 border-indigo-500/40 shadow-xs' 
                      : 'bg-slate-950/50 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${trig.enabled ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="font-bold text-xs text-white">{trig.name}</span>
                      </div>
                      <button
                        onClick={() => handleToggleTrigger(trig.id)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition cursor-pointer ${
                          trig.enabled
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {trig.enabled ? 'ACTIVE' : 'PAUSED'}
                      </button>
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] font-mono">
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-bold text-blue-400">
                        {trig.canId}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-amber-300 font-semibold">
                        {byteDisplay}
                      </span>
                      {trig.condition === 'equals' && (
                        <span className="text-slate-300">
                          == {trig.expectedHex}
                        </span>
                      )}
                      {trig.condition === 'mask_set' && (
                        <span className="text-slate-300">
                          & {trig.maskHex || '0xFF'} != 0
                        </span>
                      )}
                      {trig.condition === 'changed' && (
                        <span className="text-slate-300">
                          on change
                        </span>
                      )}
                      {trig.condition === 'any_message' && (
                        <span className="text-slate-300">
                          any frame
                        </span>
                      )}
                    </div>

                    {trig.notes && (
                      <p className="text-[11px] text-slate-400 italic">
                        {trig.notes}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                    <button
                      onClick={() => onSimulateCanTrigger(trig)}
                      title="Simulate transmitting this CAN message to test trigger"
                      className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg text-[11px] font-medium border border-indigo-500/30 flex items-center space-x-1.5 transition cursor-pointer"
                    >
                      <Play className="w-3 h-3 text-indigo-400" />
                      <span>Simulate Message</span>
                    </button>

                    <button
                      onClick={() => handleDeleteTrigger(trig.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition cursor-pointer"
                      title="Delete trigger rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
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
                placeholder="Physical pedal depressed, steering wheel button pushed, or actuator triggered..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 h-24 resize-none focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm cursor-pointer"
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
                  className="text-xs text-slate-400 hover:text-rose-400 transition cursor-pointer"
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
                  Use the <strong className="text-slate-300">[B]</strong> keyboard shortcut, push a mapped steering wheel button, or arm the Auto-Arm detector to record vehicle actions.
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
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                              bm.triggerMode === 'CAN-Triggered'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 flex items-center space-x-1'
                                : bm.triggerMode === 'Shortcut'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : bm.triggerMode === 'Auto-Armed'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {bm.triggerMode === 'CAN-Triggered' && <Crosshair className="w-2.5 h-2.5 mr-1 text-indigo-400" />}
                              <span>{bm.triggerMode}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">±{bm.deltaWindowMs || 500}ms window</span>
                          </div>

                          <p className="text-xs text-slate-300">{bm.description}</p>

                          {/* CAN Trigger Detail Badge if available */}
                          {bm.triggerMode === 'CAN-Triggered' && bm.matchedByteLabel && (
                            <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-lg px-2.5 py-1 text-[11px] text-indigo-300 flex items-center space-x-2 font-mono">
                              <span className="font-bold text-indigo-200">Matched Sync:</span>
                              <span>{bm.matchedCanId}</span>
                              <span className="text-amber-300 font-semibold">{bm.matchedByteLabel}</span>
                              {bm.matchedPayload && (
                                <span className="text-slate-400">[{bm.matchedPayload}]</span>
                              )}
                            </div>
                          )}

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
                                    className="px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono text-xs font-bold flex items-center space-x-1 transition cursor-pointer"
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
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition shrink-0 cursor-pointer"
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
