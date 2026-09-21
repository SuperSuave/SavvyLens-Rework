import React, { useState } from 'react';
import { GitBranch, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { BisectorStep } from '../types';

export const BisectorView: React.FC = () => {
  const [steps, setSteps] = useState<BisectorStep[]>([]);

  const handleTestState = (confirmed: boolean) => {
    if (steps.length === 0) {
      setSteps([
        { step: 1, hypothesis: 'Initial candidate space (0x000 - 0x7FF)', remainingCandidates: 2048, status: confirmed ? 'Confirmed' : 'Eliminated' },
        { step: 2, hypothesis: 'Narrowed candidate search space (0x000 - 0x3FF)', remainingCandidates: 1024, status: 'Pending' }
      ]);
      return;
    }
    setSteps(prev => [
      ...prev.map((s, idx) => idx === prev.length - 1 ? { ...s, status: confirmed ? 'Confirmed' : 'Eliminated' } as BisectorStep : s),
      { step: prev.length + 1, hypothesis: `Narrowed candidate search space`, remainingCandidates: Math.max(4, Math.floor(prev[prev.length - 1].remainingCandidates / 2)), status: 'Pending' }
    ]);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <GitBranch className="w-5 h-5 text-blue-400" />
              <span>CAN Bus Bisector & State Finder</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Isolate specific frame IDs and byte triggers using systematic binary search bisection</p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleTestState(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>State Active (Yes)</span>
            </button>
            <button
              onClick={() => handleTestState(false)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
            >
              <XCircle className="w-4 h-4" />
              <span>State Inactive (No)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-300">Bisection Progress</h3>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Remaining Candidates</span>
                <span className="font-mono font-bold text-blue-400">{steps.length > 0 ? steps[steps.length - 1].remainingCandidates : 2048} IDs</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${Math.max(5, 100 - (steps.length * 15))}%` }} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Bisection splits the current candidate pool in half. Trigger the vehicle state you are investigating, observe whether it occurs, and click Yes or No to narrow down the exact CAN ID.
            </p>
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">Bisector Step History</h3>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 font-mono text-xs font-bold flex items-center justify-center">
                      {step.step}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-white">{step.hypothesis}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">Candidates remaining: {step.remainingCandidates}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold ${
                    step.status === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                    step.status === 'Eliminated' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
