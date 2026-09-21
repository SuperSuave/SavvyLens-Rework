import React, { useState } from 'react';
import { 
  Wifi, Radio, Bookmark as BookmarkIcon, Sliders, Play, Pause, 
  Trash2, Send, Plus, CheckCircle, AlertCircle, RefreshCw, Layers, Search, Eye, Sparkles, Terminal, Smartphone
} from 'lucide-react';
import { CANFrame, ConnectionConfig, DBCMessage, Bookmark, CANMessageTrigger } from '../types';

interface MobileCompanionViewProps {
  frames: CANFrame[];
  connections: ConnectionConfig[];
  bookmarks: Bookmark[];
  dbcMessages: DBCMessage[];
  canTriggers: CANMessageTrigger[];
  isCapturing: boolean;
  setIsCapturing: (val: boolean) => void;
  handleClearFrames: () => void;
  handleConnectDevice: (conn: ConnectionConfig) => void;
  handleSendCustomFrame: (id: string, data: number[]) => void;
  handleCreateBookmark: (title?: string, description?: string, mode?: any) => void;
  showToast: (msg: string) => void;
  setActiveTab: (tab: string) => void;
}

export function MobileCompanionView({
  frames,
  connections,
  bookmarks,
  dbcMessages,
  canTriggers,
  isCapturing,
  setIsCapturing,
  handleClearFrames,
  handleConnectDevice,
  handleSendCustomFrame,
  handleCreateBookmark,
  showToast,
  setActiveTab
}: MobileCompanionViewProps) {
  const [mobileTab, setMobileTab] = useState<'sniffer' | 'inspector' | 'bookmarks' | 'sender' | 'settings'>('sniffer');
  const [selectedFrame, setSelectedFrame] = useState<CANFrame | null>(null);
  const [snifferViewMode, setSnifferViewMode] = useState<'grouped' | 'stream'>('grouped');
  const [filterQuery, setFilterQuery] = useState('');
  
  // Quick Sender State
  const [txId, setTxId] = useState('0x123');
  const [txBytes, setTxBytes] = useState('00 01 02 03 04 05 06 07');

  // Active Connection IP or Type
  const [ipInput, setIpInput] = useState('192.168.4.1');

  // Grouped Frames calculation
  const groupedFramesMap = new Map<string, { frame: CANFrame; count: number; firstSeen: number }>();
  frames.forEach(f => {
    const key = f.id.toLowerCase();
    if (!groupedFramesMap.has(key)) {
      groupedFramesMap.set(key, { frame: f, count: 1, firstSeen: f.timestamp });
    } else {
      const item = groupedFramesMap.get(key)!;
      item.count++;
      item.frame = f; // latest
    }
  });
  const groupedFrames = Array.from(groupedFramesMap.values());

  const filteredStream = frames.filter(f => 
    f.id.toLowerCase().includes(filterQuery.toLowerCase()) || 
    (f.name && f.name.toLowerCase().includes(filterQuery.toLowerCase())) ||
    f.data.some(b => b.toString(16).includes(filterQuery.toLowerCase()))
  ).slice(-100).reverse(); // Most recent 100

  const filteredGrouped = groupedFrames.filter(g =>
    g.frame.id.toLowerCase().includes(filterQuery.toLowerCase()) ||
    (g.frame.name && g.frame.name.toLowerCase().includes(filterQuery.toLowerCase()))
  );

  const handleSendQuick = () => {
    try {
      const bytes = txBytes.trim().split(/\s+/).map(b => parseInt(b.startsWith('0x') ? b : '0x' + b, 16));
      if (bytes.some(isNaN)) {
        showToast('Invalid hex bytes format (e.g., 00 01 0A FF)');
        return;
      }
      handleSendCustomFrame(txId.startsWith('0x') ? txId : '0x' + txId, bytes);
      showToast(`Sent frame ${txId}`);
    } catch {
      showToast('Error parsing payload bytes');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 pb-20 select-none">
      {/* Mobile Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
            SL
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              SavvyLens Mobile <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30">Companion</span>
            </h1>
            <p className="text-[10px] text-slate-400">
              {connections.find(c => c.status === 'Connected')?.name || 'Disconnected'} • {frames.length} frames
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('sniffer')}
            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold border border-rose-500 flex items-center gap-1.5 transition shadow cursor-pointer"
            title="Exit Mobile Companion and Return to Desktop View"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit Mobile View</span>
          </button>
          <button
            onClick={() => setIsCapturing(!isCapturing)}
            className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
              isCapturing 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {isCapturing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleClearFrames}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Clear Buffer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        
        {/* TAB 1: SNIFFER / TRACE STREAM */}
        {mobileTab === 'sniffer' && (
          <div className="space-y-3">
            {/* Search & Mode Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter ID, name or byte..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-0.5">
                <button
                  onClick={() => setSnifferViewMode('grouped')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition ${
                    snifferViewMode === 'grouped' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'
                  }`}
                >
                  Grouped
                </button>
                <button
                  onClick={() => setSnifferViewMode('stream')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition ${
                    snifferViewMode === 'stream' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'
                  }`}
                >
                  Stream
                </button>
              </div>
            </div>

            {/* Content List */}
            {snifferViewMode === 'grouped' ? (
              <div className="space-y-2">
                {filteredGrouped.map((item) => {
                  const f = item.frame;
                  return (
                    <div
                      key={f.id}
                      onClick={() => { setSelectedFrame(f); setMobileTab('inspector'); }}
                      className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-3 active:scale-[0.99] transition shadow-sm hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-indigo-400 text-sm bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-800/40">
                            {f.id}
                          </span>
                          <span className="text-xs font-medium text-slate-200 truncate max-w-[130px]">
                            {f.name || 'Unknown Signal'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                          {item.count} msgs
                        </div>
                      </div>

                      <div className="flex items-center justify-between font-mono text-xs bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
                        <div className="flex gap-1.5 overflow-x-auto">
                          {f.data.map((b, idx) => (
                            <span 
                              key={idx} 
                              className={`px-1 py-0.5 rounded text-[11px] ${f.changedBytes?.[idx] ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-300'}`}
                            >
                              {b.toString(16).toUpperCase().padStart(2, '0')}
                            </span>
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500 ml-2">+{f.timestamp.toFixed(2)}s</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5 font-mono">
                {filteredStream.map((f, i) => (
                  <div
                    key={i}
                    onClick={() => { setSelectedFrame(f); setMobileTab('inspector'); }}
                    className="bg-slate-900/80 border border-slate-800/60 rounded-lg p-2.5 flex items-center justify-between text-xs active:bg-slate-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px]">{f.timestamp.toFixed(2)}s</span>
                      <span className="font-bold text-indigo-400">{f.id}</span>
                      <span className="text-slate-300 text-[11px]">{f.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">DLC {f.dlc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: INSPECTOR */}
        {mobileTab === 'inspector' && (
          <div className="space-y-4">
            {selectedFrame ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs text-indigo-400 font-mono font-bold px-2 py-0.5 bg-indigo-950/60 rounded border border-indigo-900/50">
                      {selectedFrame.id} ({selectedFrame.decimalId})
                    </span>
                    <h2 className="text-sm font-bold text-white mt-1">{selectedFrame.name || 'CAN Frame Inspector'}</h2>
                  </div>
                  <button
                    onClick={() => {
                      setTxId(selectedFrame.id);
                      setTxBytes(selectedFrame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
                      setMobileTab('sender');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow"
                  >
                    <Send className="w-3.5 h-3.5" /> Replay
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div><span className="text-slate-500">Timestamp:</span> <span className="font-mono text-slate-200">+{selectedFrame.timestamp.toFixed(3)}s</span></div>
                  <div><span className="text-slate-500">DLC (Bytes):</span> <span className="font-mono text-slate-200">{selectedFrame.dlc}</span></div>
                  <div><span className="text-slate-500">Bus:</span> <span className="font-mono text-slate-200">CAN {selectedFrame.bus}</span></div>
                  <div><span className="text-slate-500">Direction:</span> <span className="font-mono text-slate-200">{selectedFrame.direction || 'RX'}</span></div>
                </div>

                {/* Byte Breakdown */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-400">Payload Bytes (D1 - D8)</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedFrame.data.map((b, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-center">
                        <div className="text-[10px] text-slate-500 font-mono mb-1">D{idx + 1}</div>
                        <div className="font-mono text-sm font-bold text-indigo-300">
                          {b.toString(16).toUpperCase().padStart(2, '0')}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{b}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ASCII Representation */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 font-mono mb-1">ASCII / String Payload</div>
                  <div className="font-mono text-xs text-emerald-400 bg-slate-900 p-2 rounded border border-slate-800 tracking-wider">
                    {selectedFrame.ascii || '................'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-slate-500 space-y-3">
                <Eye className="w-10 h-10 mx-auto text-slate-600 animate-pulse" />
                <p className="text-xs">Select any CAN frame from the Sniffer tab to inspect bytes, signals, and payloads.</p>
                <button
                  onClick={() => setMobileTab('sniffer')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-medium"
                >
                  Go to Sniffer Feed
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BOOKMARKS */}
        {mobileTab === 'bookmarks' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Timeline Bookmarks</h2>
              <button
                onClick={() => handleCreateBookmark('Mobile Bookmark', 'Marked during mobile test session', 'Manual')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Drop Bookmark
              </button>
            </div>

            {bookmarks.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No bookmarks recorded yet. Tap "Drop Bookmark" to capture event windows.
              </div>
            ) : (
              <div className="space-y-2">
                {bookmarks.map((bm) => (
                  <div key={bm.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{bm.title}</span>
                      <span className="text-[10px] bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900/50 font-mono">
                        +{bm.timestamp}s
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{bm.description}</p>
                    {bm.newIdsDetected && bm.newIdsDetected.length > 0 && (
                      <div className="text-[10px] bg-amber-500/10 text-amber-300 p-1.5 rounded border border-amber-500/20 font-mono">
                        New IDs: {bm.newIdsDetected.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SENDER / INJECTOR */}
        {mobileTab === 'sender' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-indigo-400" /> CAN Frame Injector
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Transmit custom or spoofed frames directly onto the bus.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">CAN ID (Hex)</label>
                <input
                  type="text"
                  value={txId}
                  onChange={(e) => setTxId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Payload Bytes (Hex space-separated)</label>
                <input
                  type="text"
                  value={txBytes}
                  onChange={(e) => setTxBytes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2">
                {['0x123', '0x201', '0x350', '0x7DF'].map(id => (
                  <button
                    key={id}
                    onClick={() => setTxId(id)}
                    className="py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px] hover:border-slate-700"
                  >
                    {id}
                  </button>
                ))}
              </div>

              <button
                onClick={handleSendQuick}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg flex items-center justify-center gap-2 mt-4"
              >
                <Send className="w-4 h-4" /> Transmit Frame
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS & CONNECTIONS */}
        {mobileTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-indigo-400" /> WiCAN / Hardware Connection
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Connect to hardware adapter via WiFi IP, WebSocket, or USB OTG.</p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Adapter IP Address</label>
                  <input
                    type="text"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleConnectDevice({
                        id: 'conn-wican-mobile',
                        name: 'WiCAN Pro (Mobile)',
                        type: 'GVRET_IP',
                        ipAddress: ipInput,
                        port: '80',
                        status: 'Connected',
                        baudRate: 500000,
                        isLogging: true
                      });
                      showToast(`Connected to WiCAN at ${ipInput}`);
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow"
                  >
                    Connect WiCAN
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-300">Active Connections</h3>
              {connections.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                  <div>
                    <div className="font-bold text-white">{c.name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{c.type} {c.ipAddress ? `(${c.ipAddress})` : ''}</div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${c.status === 'Connected' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Floating Action Button (FAB) for instant bookmarking on mobile */}
      <div className="fixed bottom-16 right-5 z-50">
        <button
          onClick={() => {
            handleCreateBookmark('Quick Mobile Bookmark', 'Dropped via mobile touch shortcut', 'Manual');
            showToast('Bookmark dropped!');
          }}
          className="w-14 h-14 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-full shadow-2xl flex items-center justify-center border-2 border-indigo-400/40 transition-all cursor-pointer"
          title="Drop Bookmark Instantly"
        >
          <Plus className="w-7 h-7" />
        </button>
      </div>

      {/* Thumb-friendly Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 py-2 px-3 flex justify-around items-center z-40 shadow-2xl">
        <button
          onClick={() => setMobileTab('sniffer')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            mobileTab === 'sniffer' ? 'text-indigo-400 bg-indigo-950/60 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span className="text-[10px]">Sniffer</span>
        </button>

        <button
          onClick={() => setMobileTab('inspector')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            mobileTab === 'inspector' ? 'text-indigo-400 bg-indigo-950/60 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Eye className="w-5 h-5" />
          <span className="text-[10px]">Inspector</span>
        </button>

        <button
          onClick={() => setMobileTab('bookmarks')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            mobileTab === 'bookmarks' ? 'text-indigo-400 bg-indigo-950/60 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookmarkIcon className="w-5 h-5" />
          <span className="text-[10px]">Bookmarks</span>
        </button>

        <button
          onClick={() => setMobileTab('sender')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            mobileTab === 'sender' ? 'text-indigo-400 bg-indigo-950/60 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Send className="w-5 h-5" />
          <span className="text-[10px]">Sender</span>
        </button>

        <button
          onClick={() => setMobileTab('settings')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition ${
            mobileTab === 'settings' ? 'text-indigo-400 bg-indigo-950/60 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[10px]">Settings</span>
        </button>
      </div>
    </div>
  );
}
