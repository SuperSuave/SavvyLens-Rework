import React, { useState } from 'react';
import { Network, ArrowRightLeft, ShieldCheck, Plus } from 'lucide-react';

export const CanBridgeView: React.FC = () => {
  const [bridgeRules, setBridgeRules] = useState([
    { id: 1, sourceBus: 'can0', destBus: 'can1', filterId: '0x123', action: 'Forward & Modify', active: true },
    { id: 2, sourceBus: 'can1', destBus: 'can0', filterId: '0x7E0', action: 'Forward Only', active: true },
    { id: 3, sourceBus: 'can0', destBus: 'can1', filterId: '0x300 - 0x3FF', action: 'Drop / Block', active: false },
  ]);

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <Network className="w-5 h-5 text-blue-400" />
              <span>CAN Bridge & Gateway Firewall Router</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Route, filter, and bridge CAN frames between virtual and hardware bus interfaces with zero-copy packet forwarding</p>
          </div>

          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-2 transition shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Add Routing Rule</span>
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">Active Bridge Routing Table</h3>

          <div className="overflow-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Source Bus</th>
                  <th className="py-2.5 px-3 text-center">Direction</th>
                  <th className="py-2.5 px-3">Destination Bus</th>
                  <th className="py-2.5 px-3">ID Filter / Range</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {bridgeRules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-950/40">
                    <td className="py-2.5 px-3 font-bold text-blue-400">{rule.sourceBus}</td>
                    <td className="py-2.5 px-3 text-center text-slate-500">
                      <ArrowRightLeft className="w-4 h-4 inline" />
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400">{rule.destBus}</td>
                    <td className="py-2.5 px-3 text-slate-200">{rule.filterId}</td>
                    <td className="py-2.5 px-3 text-slate-300 font-sans">{rule.action}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold ${
                        rule.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {rule.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
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
