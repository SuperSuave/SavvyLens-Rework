import React, { useState } from 'react';
import { Layers, FileText, RefreshCw, Check } from 'lucide-react';
import { ISOTPMessage, CANFrame } from '../types';

interface ISOTPDecoderViewProps {
  frames: CANFrame[];
}

export const ISOTPDecoderView: React.FC<ISOTPDecoderViewProps> = ({ frames }) => {
  const [messages, setMessages] = useState<ISOTPMessage[]>([
    {
      id: '1',
      sourceId: '0x7E0',
      targetId: '0x7E8',
      payloadHex: '10 14 62 F1 90 4E 69 73 73 61 20 4C 65 61 66 20 45 56',
      decodedText: 'UDS Response [Read VIN]: "Nissan Leaf EV"',
      timestamp: 102.45,
      serviceName: 'Read Data By ID'
    }
  ]);
  const [selectedMsg, setSelectedMsg] = useState<ISOTPMessage | null>(messages[0]);
  const [extendedAddressing, setExtendedAddressing] = useState(false);

  const handleInterpret = () => {
    // Re-scan frames for multi-frame ISO-TP flows
    const newMsgs: ISOTPMessage[] = frames.length > 0 ? [
      {
        id: '2',
        sourceId: frames[0].id,
        targetId: '0x7E8',
        payloadHex: frames[0].data.map(b => b.toString(16).padStart(2, '0')).join(' '),
        decodedText: `Decoded stream from frame ${frames[0].id} (${frames[0].name || 'Unknown'})`,
        timestamp: frames[0].timestamp,
        serviceName: 'CAN Data Stream'
      }
    ] : messages;
    setMessages(newMsgs);
    if (newMsgs.length > 0) setSelectedMsg(newMsgs[0]);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Layers className="w-5 h-5 text-blue-400" />
              <span>ISO-TP Multi-Frame Protocol Decoder</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Reassemble ISO 15765-2 multi-frame CAN packets into complete diagnostic and diagnostic session streams</p>
          </div>

          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-2 text-xs text-slate-300 bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
              <input
                type="checkbox"
                checked={extendedAddressing}
                onChange={e => setExtendedAddressing(e.target.checked)}
                className="rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
              />
              <span>Extended Addressing</span>
            </label>

            <button
              onClick={handleInterpret}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Interpret Captured Frames</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">Decoded ISO-TP Messages ({messages.length})</h3>

            <div className="flex-1 overflow-auto space-y-2 max-h-[350px]">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedMsg(msg)}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    selectedMsg?.id === msg.id
                      ? 'bg-blue-600/10 border-blue-500/50 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-blue-400 font-bold">{msg.sourceId} → {msg.targetId}</span>
                    <span className="text-slate-400">+{msg.timestamp.toFixed(2)}s</span>
                  </div>
                  <div className="text-xs font-sans font-medium text-slate-200">{msg.decodedText}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate mt-1">{msg.payloadHex}</div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center py-12 text-xs text-slate-500">No ISO-TP frames found. Capture or load logs.</div>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col space-y-4">
            <h3 className="text-xs font-semibold text-slate-300">Message Inspector</h3>

            {selectedMsg ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Service / Protocol</span>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-medium text-white">{selectedMsg.serviceName || 'ISO-TP Stream'}</div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Decoded Payload</span>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-emerald-400 font-mono">{selectedMsg.decodedText}</div>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">Raw Hex Payload ({selectedMsg.payloadHex.split(' ').length} bytes)</span>
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-slate-300 break-all">{selectedMsg.payloadHex}</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">Select a message to inspect payload bytes</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
