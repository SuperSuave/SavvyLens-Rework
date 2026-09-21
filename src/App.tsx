import React, { useState, useEffect } from 'react';
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
import { BookmarkManagerView } from './components/BookmarkManagerView';
import { CanBridgeView } from './components/CanBridgeView';
import { ConnectionModal } from './components/ConnectionModal';
import { PlaybackStatusBar } from './components/PlaybackStatusBar';
import { INITIAL_CONNECTIONS, INITIAL_DBC_MESSAGES } from './data/mockData';
import { CANFrame, ConnectionConfig, DBCMessage, ScriptItem } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState('sniffer');
  const [frames, setFrames] = useState<CANFrame[]>([]);
  const [connections, setConnections] = useState<ConnectionConfig[]>(INITIAL_CONNECTIONS);
  const [dbcMessages, setDbcMessages] = useState<DBCMessage[]>(INITIAL_DBC_MESSAGES);
  const [isCapturing, setIsCapturing] = useState(true);
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);

  const handleClearFrames = () => {
    setFrames([]);
  };

  const handleSendCustomFrame = (id: string, data: number[]) => {
    const decId = parseInt(id.replace('0x', ''), 16);
    const newFrame: CANFrame = {
      id,
      decimalId: decId,
      name: 'Manual_TX_Frame',
      timestamp: frames.length > 0 ? frames[frames.length - 1].timestamp + 0.01 : 100.0,
      bus: 0,
      dlc: data.length,
      data,
      ascii: data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
      count: 1,
      direction: 'TX'
    };
    setFrames(prev => [...prev, newFrame]);
  };

  const handleExportLogs = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      ["Timestamp,Bus,Direction,ID,Name,DLC,Data"]
      .concat(frames.map(f => `${f.timestamp},${f.bus},${f.direction || 'RX'},${f.id},${f.name || ''},${f.dlc},"${f.data.join(' ')}"`))
      .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "savvylens_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportLogs = () => {
    alert("Log file import dialog: You can load .trc, .csv, .log, or .dbc files here.");
  };

  const handleRunScript = (script: ScriptItem) => {
    setTimeout(() => {
      handleSendCustomFrame("0x123", [0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03, 0x04]);
    }, 500);
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

      <div className="flex flex-1 overflow-hidden">
        <NavigationRail activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeTab === 'sniffer' && (
            <LiveSnifferView
              frames={frames}
              onClearFrames={handleClearFrames}
              dbcMessages={dbcMessages}
              onSendCustomFrame={handleSendCustomFrame}
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
          {activeTab === 'bookmarks' && <BookmarkManagerView />}
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
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto space-y-4">
                <h2 className="text-lg font-bold text-white">CAN Connections & Log Servers</h2>
                <p className="text-xs text-slate-400">Manage your active hardware interfaces, serial ports, GVRET over IP, and CAN over MQTT bridges.</p>
                <button
                  onClick={() => setIsConnModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition"
                >
                  Open Connection Manager
                </button>
              </div>
            </div>
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
      />
    </div>
  );
}
