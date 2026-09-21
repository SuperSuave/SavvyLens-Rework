import React, { useState, useRef } from 'react';
import { GitCompare, Upload, FileText, ArrowRight, CheckCircle, RefreshCw } from 'lucide-react';
import { FileComparisonResult, CANFrame } from '../types';
import { parseCanFile } from '../utils/logParser';

export const FileComparatorView: React.FC = () => {
  const [fileAName, setFileAName] = useState('ignition_off.csv');
  const [fileBName, setFileBName] = useState('ignition_on.csv');
  const [framesA, setFramesA] = useState<CANFrame[]>([]);
  const [framesB, setFramesB] = useState<CANFrame[]>([]);
  const fileAInputRef = useRef<HTMLInputElement>(null);
  const fileBInputRef = useRef<HTMLInputElement>(null);

  const [results, setResults] = useState<FileComparisonResult[]>([
    { frameId: '0x123', name: 'EV_Inverter_Status', countA: 0, countB: 245, diffSummary: 'Appeared in File B (New active stream)' },
    { frameId: '0x204', name: 'BMS_Cell_Summary', countA: 120, countB: 310, diffSummary: 'Frequency increased by 158%' },
    { frameId: '0x318', name: 'BCM_Door_Status', countA: 45, countB: 45, diffSummary: 'Identical payload and frequency' },
    { frameId: '0x550', name: 'Climate_Status', countA: 0, countB: 88, diffSummary: 'Only present in File B' },
  ]);

  const computeDiff = (aList: CANFrame[], bList: CANFrame[]) => {
    const countsA: Record<string, { count: number; name?: string; lastData?: number[] }> = {};
    const countsB: Record<string, { count: number; name?: string; lastData?: number[] }> = {};

    aList.forEach(f => {
      if (!countsA[f.id]) countsA[f.id] = { count: 0, name: f.name, lastData: f.data };
      countsA[f.id].count++;
    });

    bList.forEach(f => {
      if (!countsB[f.id]) countsB[f.id] = { count: 0, name: f.name, lastData: f.data };
      countsB[f.id].count++;
    });

    const allIds = Array.from(new Set([...Object.keys(countsA), ...Object.keys(countsB)])).sort();
    const diffList: FileComparisonResult[] = allIds.map(id => {
      const recA = countsA[id];
      const recB = countsB[id];
      const countA = recA ? recA.count : 0;
      const countB = recB ? recB.count : 0;
      const name = recB?.name || recA?.name || 'CAN_Frame';

      let diffSummary = '';
      if (countA === 0 && countB > 0) {
        diffSummary = 'New stream (Only in File B)';
      } else if (countA > 0 && countB === 0) {
        diffSummary = 'Stopped stream (Only in File A)';
      } else if (countA === countB) {
        diffSummary = 'Matching frame count';
      } else {
        const pct = Math.round(((countB - countA) / countA) * 100);
        diffSummary = pct > 0 ? `Frequency rose by +${pct}%` : `Frequency dropped by ${pct}%`;
      }

      return {
        frameId: id,
        name,
        countA,
        countB,
        diffSummary
      };
    });

    setResults(diffList);
  };

  const handleLoadFileA = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileAName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const res = parseCanFile(file.name, text);
        if (res.frames && res.frames.length > 0) {
          setFramesA(res.frames);
          computeDiff(res.frames, framesB);
        }
      } catch (err: any) {
        alert(err.message || 'Failed to parse file A');
      }
    };
    reader.readAsText(file);
  };

  const handleLoadFileB = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileBName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const res = parseCanFile(file.name, text);
        if (res.frames && res.frames.length > 0) {
          setFramesB(res.frames);
          computeDiff(framesA, res.frames);
        }
      } catch (err: any) {
        alert(err.message || 'Failed to parse file B');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <GitCompare className="w-5 h-5 text-blue-400" />
              <span>Log File Comparator (Diff Engine)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Compare two CAN trace logs (e.g. before/after button press or ignition state) to isolate unique frames</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <input 
              ref={fileAInputRef} 
              type="file" 
              accept=".csv,.trc,.log,.asc,.txt,.json" 
              className="hidden" 
              onChange={handleLoadFileA} 
            />
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Trace File A (Baseline)</span>
                <div className="text-sm font-bold text-white mt-0.5">{fileAName}</div>
                {framesA.length > 0 && <span className="text-[10px] text-blue-400 font-mono">{framesA.length} frames parsed</span>}
              </div>
            </div>
            <button 
              onClick={() => fileAInputRef.current?.click()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Choose File A
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <input 
              ref={fileBInputRef} 
              type="file" 
              accept=".csv,.trc,.log,.asc,.txt,.json" 
              className="hidden" 
              onChange={handleLoadFileB} 
            />
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Trace File B (Comparison)</span>
                <div className="text-sm font-bold text-white mt-0.5">{fileBName}</div>
                {framesB.length > 0 && <span className="text-[10px] text-emerald-400 font-mono">{framesB.length} frames parsed</span>}
              </div>
            </div>
            <button 
              onClick={() => fileBInputRef.current?.click()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Choose File B
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">Differential Analysis ({results.length} IDs Compared)</h3>

          <div className="overflow-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Frame ID</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3 text-right">Count A</th>
                  <th className="py-2.5 px-3 text-right">Count B</th>
                  <th className="py-2.5 px-3">Difference Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-950/40">
                    <td className="py-2.5 px-3 font-bold text-blue-400">{r.frameId}</td>
                    <td className="py-2.5 px-3 text-slate-200 font-sans">{r.name}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{r.countA}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{r.countB}</td>
                    <td className="py-2.5 px-3 text-amber-400 font-sans text-xs">{r.diffSummary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
