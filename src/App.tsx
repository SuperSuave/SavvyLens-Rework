import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { NavigationRail } from './components/NavigationRail';
import { LiveSnifferView } from './components/LiveSnifferView';
import { DBCManagerView } from './components/DBCManagerView';
import { GraphingView } from './components/GraphingView';
import { SenderView } from './components/SenderView';
import { ScriptingView } from './components/ScriptingView';
import { UDSScannerView } from './components/UDSScannerView';
import { ISOTPDecoderView } from './components/ISOTPDecoderView';
import { FuzzingView } from './components/FuzzingView';
import { BisectorView } from './components/BisectorView';
import { FileComparatorView } from './components/FileComparatorView';
import { BookmarkManagerView, AutoArmConfig } from './components/BookmarkManagerView';
import { CanBridgeView } from './components/CanBridgeView';
import { ConnectionsView } from './components/ConnectionsView';
import { ConnectionModal } from './components/ConnectionModal';
import { PlaybackStatusBar } from './components/PlaybackStatusBar';
import { INITIAL_CONNECTIONS, INITIAL_DBC_MESSAGES, generateInitialCANFrames } from './data/mockData';
import { CANFrame, ConnectionConfig, DBCMessage, ScriptItem, Bookmark } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState('sniffer');
  const [frames, setFrames] = useState<CANFrame[]>(() => generateInitialCANFrames());
  const [connections, setConnections] = useState<ConnectionConfig[]>(INITIAL_CONNECTIONS);
  const [dbcMessages, setDbcMessages] = useState<DBCMessage[]>(INITIAL_DBC_MESSAGES);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [snifferFilterTerm, setSnifferFilterTerm] = useState('');
  const [isCapturing, setIsCapturing] = useState(true);
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // SavvyLens Auto-Arm Configuration
  const [autoArm, setAutoArm] = useState<AutoArmConfig>({
    enabled: false,
    autoDisableOnTrigger: true,
    deltaWindowMs: 500,
    triggerCondition: 'any_new_id'
  });

  const framesRef = useRef(frames);
  framesRef.current = frames;

  const autoArmRef = useRef(autoArm);
  autoArmRef.current = autoArm;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const handleClearFrames = () => {
    setFrames([]);
    showToast('SavvyLens: Frame buffer cleared');
  };

  // SavvyLens Bookmark Creation & Temporal Delta-Window Correlation Engine
  const handleCreateBookmark = useCallback((
    title?: string, 
    description?: string, 
    triggerMode: 'Manual' | 'Shortcut' | 'Auto-Armed' = 'Manual'
  ): Bookmark => {
    const currentFrames = framesRef.current;
    const currentTs = currentFrames.length > 0 ? currentFrames[currentFrames.length - 1].timestamp : 0;
    const currentArm = autoArmRef.current;
    const deltaSec = (currentArm.deltaWindowMs || 500) / 1000;
    const windowStart = Math.max(0, currentTs - deltaSec);
    const windowEnd = currentTs + deltaSec;

    // Isolate traffic within delta window
    const windowFrames = currentFrames.filter(f => f.timestamp >= windowStart && f.timestamp <= windowEnd);
    const windowIds = Array.from(new Set(windowFrames.map(f => f.id)));

    // Historical IDs seen before this window
    const historicalIds = new Set(currentFrames.filter(f => f.timestamp < windowStart).map(f => f.id));

    // Discover novel/new CAN IDs recorded at the same time as this bookmark
    const newIdsDetected = windowIds.filter(id => !historicalIds.has(id));
    const changedIdsDetected = Array.from(new Set(
      windowFrames.filter(f => f.changedBytes?.some(b => b)).map(f => f.id)
    ));

    const newBm: Bookmark = {
      id: 'bm-' + Date.now(),
      timestamp: Number(currentTs.toFixed(3)),
      title: title || `Bookmark @ +${currentTs.toFixed(2)}s`,
      description: description || (
        newIdsDetected.length > 0 
          ? `Recorded ${newIdsDetected.length} new CAN ID(s) during event window [${newIdsDetected.join(', ')}]` 
          : 'Timeline bookmark dropped during testing'
      ),
      newIdsDetected,
      changedIdsDetected,
      deltaWindowMs: currentArm.deltaWindowMs,
      triggerMode
    };

    setBookmarks(prev => [newBm, ...prev]);

    // Auto-disable detector if armed
    if (currentArm.enabled && currentArm.autoDisableOnTrigger) {
      setAutoArm(prev => ({ ...prev, enabled: false }));
      showToast(`SavvyLens: Auto-Arm triggered and auto-disabled. Recorded ${newIdsDetected.length} new ID(s).`);
    } else {
      showToast(`SavvyLens: Bookmark recorded (+${currentTs.toFixed(2)}s)`);
    }

    return newBm;
  }, []);

  // Global Keyboard Shortcut [B] Listener for SavvyLens Instant Bookmarks
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is actively typing in a form input or textarea
      const target = e.target as HTMLElement;
      if (
        target && (
          target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.isContentEditable
        )
      ) {
        return;
      }

      // Key 'B' or 'b' drops a SavvyLens bookmark
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleCreateBookmark(undefined, undefined, 'Shortcut');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateBookmark]);

  // Live streaming CAN traffic simulation when isCapturing is active
  useEffect(() => {
    if (!isCapturing) return;

    const interval = setInterval(() => {
      const currentFrames = framesRef.current;
      const lastTs = currentFrames.length > 0 ? currentFrames[currentFrames.length - 1].timestamp : 120.0;
      const newTs = Number((lastTs + 0.045 + Math.random() * 0.02).toFixed(3));
      
      const choice = Math.random();
      let id = '0x201';
      let decId = 513;
      let name = 'ECM_Engine_Status';
      let data = [0, 0, 0, 0, 0, 0, 0, 0];

      if (choice < 0.5) {
        const alive = Math.floor(newTs * 20) % 16;
        const rpm = 1800 + Math.floor(Math.sin(newTs) * 300);
        const crc = (alive ^ (rpm & 0xFF) ^ ((rpm >> 8) & 0xFF) ^ 0x55) & 0xFF;
        data = [alive, rpm & 0xFF, (rpm >> 8) & 0xFF, Math.floor(rpm / 50), 0x00, 0x02, 0x10, crc];
      } else if (choice < 0.8) {
        id = '0x156';
        decId = 342;
        name = 'SAS_Steering_Angle';
        const angle = Math.floor(Math.sin(newTs * 0.5) * 150);
        data = [angle & 0xFF, (angle >> 8) & 0xFF, 0x24, 0x00, 0x00, 0x00, 0x00, 0x88];
      } else {
        id = '0x320';
        decId = 800;
        name = 'ABS_Wheel_Speeds';
        const spd = 34 + Math.floor(Math.cos(newTs * 0.2) * 5);
        data = [spd, spd, spd, spd, 0x01, 0x00, 0x00, (spd ^ 0xFE) & 0xFF];
      }

      const lastMatch = [...currentFrames].reverse().find(f => f.id === id);
      const changedBytes = data.map((b, i) => !lastMatch || lastMatch.data[i] !== b);
      const changedBits = data.map((b, i) => lastMatch ? ((lastMatch.data[i] ^ b) & 0xFF) : 0);

      const newFrame: CANFrame = {
        id,
        decimalId: decId,
        name,
        timestamp: newTs,
        bus: 0,
        dlc: data.length,
        data,
        ascii: data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
        count: lastMatch ? lastMatch.count + 1 : 1,
        direction: 'RX',
        changedBytes,
        changedBits,
        prevData: lastMatch ? lastMatch.data : undefined,
        isNewId: !lastMatch
      };

      setFrames(prev => {
        const next = [...prev, newFrame];
        return next.length > 500 ? next.slice(next.length - 500) : next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isCapturing]);

  // Handle Transmitting Frame with SavvyLens Bit & Byte Change Tracking
  const handleSendCustomFrame = (id: string, data: number[]) => {
    const decId = parseInt(id.replace('0x', ''), 16);
    const prevFrames = framesRef.current;
    
    // Find previous frame with identical ID to compute changed bits & bytes
    const lastMatchingFrame = [...prevFrames].reverse().find(f => f.id.toLowerCase() === id.toLowerCase());
    
    const isNewId = !lastMatchingFrame;
    const changedBytes = data.map((byte, idx) => {
      if (!lastMatchingFrame || lastMatchingFrame.data[idx] === undefined) return false;
      return lastMatchingFrame.data[idx] !== byte;
    });

    // 8-bit XOR mask of toggled bits per byte (SavvyLens Bit Matrix engine)
    const changedBits = data.map((byte, idx) => {
      if (!lastMatchingFrame || lastMatchingFrame.data[idx] === undefined) return 0;
      return (lastMatchingFrame.data[idx] ^ byte) & 0xFF;
    });

    const newFrame: CANFrame = {
      id,
      decimalId: decId,
      name: isNewId ? 'TX_New_Frame' : 'Manual_TX_Frame',
      timestamp: prevFrames.length > 0 ? prevFrames[prevFrames.length - 1].timestamp + 0.01 : 100.0,
      bus: 0,
      dlc: data.length,
      data,
      ascii: data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
      count: lastMatchingFrame ? lastMatchingFrame.count + 1 : 1,
      direction: 'TX',
      changedBytes,
      changedBits,
      prevData: lastMatchingFrame ? lastMatchingFrame.data : undefined,
      isNewId
    };

    setFrames(prev => [...prev, newFrame]);

    // Check SavvyLens Auto-Arm Trigger conditions
    if (autoArmRef.current.enabled) {
      const condition = autoArmRef.current.triggerCondition;
      const hasByteChange = changedBytes.some(Boolean);
      if ((condition === 'any_new_id' && isNewId) || (condition === 'payload_change' && hasByteChange)) {
        setTimeout(() => {
          handleCreateBookmark(
            `Auto-Armed Event: ${id} Triggered`, 
            `Auto-detector fired on ${isNewId ? 'novel CAN ID' : 'payload byte change'}`, 
            'Auto-Armed'
          );
        }, 10);
      }
    }
  };

  const handleExportLogs = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      ["Timestamp,Bus,Direction,ID,Name,DLC,Data"]
      .concat(frames.map(f => `${f.timestamp},${f.bus},${f.direction || 'RX'},${f.id},${f.name || ''},${f.dlc},"${f.data.join(' ')}"`))
      .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `savvylens_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('SavvyLens: Exported trace logs to CSV');
  };

  const handleImportLogs = () => {
    showToast("SavvyLens: Import ready for .trc, .csv, .log, and .dbc trace files.");
  };

  const handleRunScript = (script: ScriptItem) => {
    setTimeout(() => {
      handleSendCustomFrame("0x123", [0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04]);
    }, 500);
  };

  const handleConnectDevice = (newConn: ConnectionConfig) => {
    setConnections(prev => {
      const exists = prev.some(c => c.id === newConn.id || (newConn.ipAddress && c.ipAddress === newConn.ipAddress));
      if (exists) {
        return prev.map(c => {
          if (c.id === newConn.id || (newConn.ipAddress && c.ipAddress === newConn.ipAddress)) {
            return { ...c, ...newConn, status: 'Connected' as const };
          }
          return { ...c, status: 'Disconnected' as const };
        });
      }
      return [newConn, ...prev.map(c => ({ ...c, status: 'Disconnected' as const }))];
    });

    setIsCapturing(true);
    showToast(`Connected to ${newConn.name} (${newConn.ipAddress || newConn.port})`);
  };

  const handleDisconnectDevice = (connectionId: string) => {
    setConnections(prev => prev.map(c => c.id === connectionId ? { ...c, status: 'Disconnected' as const } : c));
    showToast('Hardware interface disconnected');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connections={connections}
        isCapturing={isCapturing}
        setIsCapturing={setIsCapturing}
        onOpenConnections={() => setIsConnModalOpen(true)}
        onExportLogs={handleExportLogs}
        onImportLogs={handleImportLogs}
        frameCount={frames.length}
      />

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-12 right-6 z-50 bg-blue-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl border border-blue-400/40 animate-bounce">
          {toastMessage}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <NavigationRail activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeTab === 'sniffer' && (
            <LiveSnifferView
              frames={frames}
              onClearFrames={handleClearFrames}
              dbcMessages={dbcMessages}
              onSendCustomFrame={handleSendCustomFrame}
              onQuickBookmark={() => handleCreateBookmark(undefined, undefined, 'Shortcut')}
              onBookmarkFromFrame={(frame, correlatedIds) => {
                const newBm: Bookmark = {
                  id: 'bm-' + Date.now(),
                  timestamp: Number(frame.timestamp.toFixed(3)),
                  title: `Event on ${frame.id} (+${frame.timestamp.toFixed(2)}s)`,
                  description: `Correlated ${correlatedIds.length} nearby message(s) [${correlatedIds.slice(0, 5).join(', ')}]`,
                  newIdsDetected: correlatedIds,
                  deltaWindowMs: 500,
                  triggerMode: 'Manual'
                };
                setBookmarks(prev => [newBm, ...prev]);
                showToast(`SavvyLens: Event bookmark created from frame with ${correlatedIds.length} correlated IDs`);
              }}
              initialSearchTerm={snifferFilterTerm}
            />
          )}
          {activeTab === 'dbc' && (
            <DBCManagerView
              dbcMessages={dbcMessages}
              setDbcMessages={setDbcMessages}
            />
          )}
          {activeTab === 'uds' && <UDSScannerView />}
          {activeTab === 'isotp' && <ISOTPDecoderView frames={frames} />}
          {activeTab === 'fuzzing' && <FuzzingView />}
          {activeTab === 'bisector' && <BisectorView />}
          {activeTab === 'comparator' && <FileComparatorView />}
          {activeTab === 'bookmarks' && (
            <BookmarkManagerView
              bookmarks={bookmarks}
              onAddBookmark={handleCreateBookmark}
              onDeleteBookmark={(id) => setBookmarks(bms => bms.filter(b => b.id !== id))}
              onClearBookmarks={() => setBookmarks([])}
              autoArm={autoArm}
              setAutoArm={setAutoArm}
              frames={frames}
              onSelectFilterId={(id) => {
                setSnifferFilterTerm(id);
                setActiveTab('sniffer');
              }}
            />
          )}
          {activeTab === 'bridge' && <CanBridgeView />}
          {activeTab === 'graphing' && (
            <GraphingView
              frames={frames}
              dbcMessages={dbcMessages}
            />
          )}
          {activeTab === 'sender' && (
            <SenderView
              onSendFrame={handleSendCustomFrame}
            />
          )}
          {activeTab === 'scripting' && (
            <ScriptingView
              onRunScript={handleRunScript}
            />
          )}
          {activeTab === 'connections' && (
            <ConnectionsView
              connections={connections}
              setConnections={setConnections}
              onConnectDevice={handleConnectDevice}
              onDisconnectDevice={handleDisconnectDevice}
              onNavigateToSniffer={() => setActiveTab('sniffer')}
            />
          )}
        </main>
      </div>

      <PlaybackStatusBar
        connections={connections}
        isCapturing={isCapturing}
        setIsCapturing={setIsCapturing}
        frameCount={frames.length}
      />

      <ConnectionModal
        isOpen={isConnModalOpen}
        onClose={() => setIsConnModalOpen(false)}
        connections={connections}
        setConnections={setConnections}
        onConnectDevice={handleConnectDevice}
      />
    </div>
  );
}
