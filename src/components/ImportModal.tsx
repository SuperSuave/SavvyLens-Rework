import React, { useState, useRef } from 'react';
import { 
  X, Upload, FileText, Database, CheckCircle, AlertCircle, 
  Layers, RefreshCw, FileCode, ArrowRight, Sparkles 
} from 'lucide-react';
import { CANFrame, DBCMessage } from '../types';
import { parseCanFile, ParseResult } from '../utils/logParser';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFrames: (frames: CANFrame[], replace: boolean) => void;
  onImportDbc: (messages: DBCMessage[], replace: boolean) => void;
  activeFrameCount: number;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportFrames,
  onImportDbc,
  activeFrameCount
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replaceMode, setReplaceMode] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = (file: File) => {
    setError(null);
    setParseResult(null);
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text || text.trim().length === 0) {
          throw new Error('Selected file is empty.');
        }
        const result = parseCanFile(file.name, text);
        setParseResult(result);
      } catch (err: any) {
        setError(err.message || 'Failed to parse file. Please verify the CAN format.');
      }
    };
    reader.onerror = () => {
      setError('Error reading file from disk.');
    };
    reader.readAsText(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleApplyImport = () => {
    if (!parseResult) return;

    if (parseResult.frames && parseResult.frames.length > 0) {
      onImportFrames(parseResult.frames, replaceMode);
    }
    if (parseResult.dbcMessages && parseResult.dbcMessages.length > 0) {
      onImportDbc(parseResult.dbcMessages, replaceMode);
    }
    onClose();
  };

  // Preset sample loaders for immediate testing
  const handleLoadSample = (sampleType: 'candump' | 'csv' | 'dbc') => {
    setError(null);
    if (sampleType === 'candump') {
      const sampleText = `(120.450123) can0 201#0F08B01E00021055
(120.454200) can0 156#7800240000000088
(120.457890) can0 320#23232323010000DB
(120.462340) can0 0A0#01FF8000000000AA
(120.468900) can0 1F5#040200000000001F
(120.472100) can0 480#0410000000000000
(120.475600) can0 201#0009B01E00021055
(120.480000) can0 320#24242424010000DC`;
      setFileName('sample_wican_candump.log');
      setFileSize('0.4 KB');
      setParseResult(parseCanFile('sample_wican_candump.log', sampleText));
    } else if (sampleType === 'csv') {
      const sampleCsv = `Timestamp,Bus,Direction,ID,Name,DLC,Data
121.010,0,RX,0x201,ECM_Engine_Status,8,12 180 30 0 0 2 16 85
121.025,0,RX,0x156,SAS_Steering_Angle,8,120 0 36 0 0 0 0 136
121.040,0,RX,0x320,ABS_Wheel_Speeds,8,35 35 35 35 1 0 0 220
121.055,0,TX,0x123,Diag_Tester_Present,8,2 62 0 0 0 0 0 0
121.070,0,RX,0x1F5,TCM_Transmission_State,8,4 2 0 0 0 0 0 31`;
      setFileName('savvycan_trace_export.csv');
      setFileSize('0.3 KB');
      setParseResult(parseCanFile('savvycan_trace_export.csv', sampleCsv));
    } else if (sampleType === 'dbc') {
      const sampleDbc = `VERSION ""
NS_ :
BS_:
BU_: ECM ABS BCM

BO_ 513 ECM_Engine_Status: 8 ECM
 SG_ Alive_Counter : 0|4@1+ (1,0) [0|15] "cnt" All
 SG_ Engine_RPM : 8|16@1+ (0.25,0) [0|8000] "rpm" All
 SG_ Throttle_Pos : 24|8@1+ (0.392,0) [0|100] "%" All

BO_ 342 SAS_Steering_Angle: 8 ECM
 SG_ Steering_Angle : 0|16@1- (0.1,0) [-720|720] "deg" All

BO_ 800 ABS_Wheel_Speeds: 8 ABS
 SG_ WheelSpeed_FL : 0|8@1+ (1,0) [0|255] "km/h" All
 SG_ WheelSpeed_FR : 8|8@1+ (1,0) [0|255] "km/h" All
 SG_ WheelSpeed_RL : 16|8@1+ (1,0) [0|255] "km/h" All
 SG_ WheelSpeed_RR : 24|8@1+ (1,0) [0|255] "km/h" All`;
      setFileName('automotive_powertrain.dbc');
      setFileSize('0.6 KB');
      setParseResult(parseCanFile('automotive_powertrain.dbc', sampleDbc));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Import CAN Data & Databases</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30 font-semibold">
                  SavvyLens I/O
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Load CAN bus traces (.csv, .trc, .log, .asc) or Vector DBC databases (.dbc, .json)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center ${
              isDragging 
                ? 'border-blue-500 bg-blue-600/15 scale-[0.99]' 
                : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/70'
            }`}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv,.trc,.log,.asc,.txt,.dbc,.json" 
              className="hidden" 
              onChange={handleFileSelect}
            />

            <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center mb-3">
              <FileCode className="w-6 h-6" />
            </div>

            <p className="text-sm font-semibold text-white mb-1">
              Drag & drop CAN trace or DBC file here
            </p>
            <p className="text-xs text-slate-400 mb-3">
              or <span className="text-blue-400 underline underline-offset-2">browse from your computer</span>
            </p>

            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-slate-400">
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">.csv (SavvyCAN)</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">.trc (PCAN)</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">.log (candump)</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">.asc (Vector)</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">.dbc (Database)</span>
              <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-mono">.json</span>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center justify-between bg-slate-950/50 p-3 rounded-xl border border-slate-800/80">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Or test with real-world sample data:</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleLoadSample('candump')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition"
              >
                candump Log
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('csv')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 text-xs font-medium transition"
              >
                CSV Trace
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('dbc')}
                className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg border border-blue-500/30 text-xs font-medium transition"
              >
                Vector DBC
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-start space-x-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Parse Error</strong>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Parsed Result Preview */}
          {parseResult && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">{fileName}</span>
                  <span className="text-[10px] text-slate-400">({fileSize})</span>
                </div>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-semibold">
                  Valid CAN Data
                </span>
              </div>

              <div className="text-xs text-slate-300">
                <p className="font-medium text-emerald-400 mb-1">{parseResult.summary}</p>
              </div>

              {/* Frames Details */}
              {parseResult.frames && parseResult.frames.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Parsed frames preview:</span>
                    <span>Total: <strong className="text-white font-mono">{parseResult.frames.length}</strong></span>
                  </div>

                  <div className="max-h-32 overflow-y-auto font-mono text-[11px] bg-slate-900/90 rounded-lg border border-slate-800 p-2 space-y-1">
                    {parseResult.frames.slice(0, 5).map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-300 border-b border-slate-800/40 pb-1 last:border-0 last:pb-0">
                        <span className="text-slate-500">{f.timestamp.toFixed(3)}s</span>
                        <span className="text-blue-400 font-bold">{f.id}</span>
                        <span className="text-slate-400">{f.name || 'CAN_Frame'}</span>
                        <span className="text-slate-200">[{f.data.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}]</span>
                      </div>
                    ))}
                    {parseResult.frames.length > 5 && (
                      <p className="text-[10px] text-slate-500 italic pt-1 text-center">
                        ...and {parseResult.frames.length - 5} more frames
                      </p>
                    )}
                  </div>

                  {/* Mode Option */}
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Buffer Action:</span>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setReplaceMode(true)}
                        className={`px-2.5 py-1 rounded-lg border transition font-medium ${
                          replaceMode 
                            ? 'bg-blue-600 text-white border-blue-500' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        Replace Feed ({activeFrameCount} active)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplaceMode(false)}
                        className={`px-2.5 py-1 rounded-lg border transition font-medium ${
                          !replaceMode 
                            ? 'bg-blue-600 text-white border-blue-500' 
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        Append to Feed
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* DBC Details */}
              {parseResult.dbcMessages && parseResult.dbcMessages.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center space-x-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400" />
                      <span>DBC Messages Defined:</span>
                    </span>
                    <span className="text-white font-mono">{parseResult.dbcMessages.length} Messages</span>
                  </div>

                  <div className="max-h-28 overflow-y-auto text-xs bg-slate-900/90 rounded-lg border border-slate-800 p-2 space-y-1">
                    {parseResult.dbcMessages.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-slate-300">
                        <span className="font-mono text-blue-400 font-bold">{m.hexId}</span>
                        <span className="text-slate-200 font-medium">{m.name}</span>
                        <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 rounded">{m.signals.length} sigs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Cancel
          </button>

          <button
            onClick={handleApplyImport}
            disabled={!parseResult}
            className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
              parseResult
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 active:scale-95 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
            }`}
          >
            <span>Confirm & Load into SavvyLens</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
