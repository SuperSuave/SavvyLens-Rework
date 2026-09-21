import React, { useState } from 'react';
import { 
  Layers, Database, LineChart, Send, Code, Cpu, Shield, Zap, 
  GitBranch, GitCompare, Bookmark, Network, ChevronLeft, ChevronRight, Activity, Wifi 
} from 'lucide-react';
import { SavvyLensLogo } from './SavvyLensLogo';

interface NavigationRailProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  defaultCollapsed?: boolean;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({ 
  activeTab, 
  setActiveTab,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const tabs = [
    { id: 'sniffer', label: 'Live Sniffer', icon: Layers, description: 'Real-time CAN frame grid & sniffer' },
    { id: 'dbc', label: 'DBC Manager', icon: Database, description: 'Signal decoders & message database' },
    { id: 'uds', label: 'UDS Scanner', icon: Shield, description: 'Diagnostic services & ECU discovery' },
    { id: 'isotp', label: 'ISO-TP Decoder', icon: Layers, description: 'Multi-frame packet reassembly' },
    { id: 'fuzzing', label: 'Fuzzing & Sweeper', icon: Zap, description: 'Shotgun fuzzing & 8x8 bit matrix' },
    { id: 'bisector', label: 'State Bisector', icon: GitBranch, description: 'Binary search state isolation' },
    { id: 'comparator', label: 'File Comparator', icon: GitCompare, description: 'Trace log diff engine' },
    { id: 'bookmarks', label: 'Bookmarks & Events', icon: Bookmark, description: 'Timeline event correlation' },
    { id: 'bridge', label: 'CAN Bridge / Router', icon: Network, description: 'Gateway firewall & routing rules' },
    { id: 'graphing', label: 'Graphing & Signals', icon: LineChart, description: 'Real-time time-series plots' },
    { id: 'sender', label: 'Frame Sender', icon: Send, description: 'Cyclic & manual CAN frame transmission' },
    { id: 'scripting', label: 'Scripting Engine', icon: Code, description: 'JavaScript automation & fuzzing' },
    { id: 'connections', label: 'Device Detector & Hardware', icon: Wifi, description: 'WiCAN & CAN-Do auto-discovery' },
  ];

  return (
    <nav 
      id="sidebar-navigation"
      aria-label="Sidebar Navigation"
      className={`bg-slate-900/95 border-r border-slate-800 flex flex-col select-none shrink-0 overflow-y-auto overflow-x-hidden transition-all duration-200 ${
        isCollapsed ? 'w-16 p-2' : 'w-64 p-3'
      }`}
    >
      {/* Top Header & Collapse Toggle */}
      <div className={`flex items-center mb-2 pb-2 border-b border-slate-800/80 ${isCollapsed ? 'flex-col space-y-2' : 'justify-between px-1'}`}>
        {!isCollapsed ? (
          <div className="flex items-center space-x-2">
            <SavvyLensLogo size={22} />
            <span className="text-xs font-semibold text-slate-300 tracking-wide">
              Modules
            </span>
          </div>
        ) : (
          <div className="py-1 flex justify-center">
            <SavvyLensLogo size={24} />
          </div>
        )}
        <button
          id="collapse-sidebar-toggle-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center justify-center"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav items list */}
      <div className="space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              id={`nav-tab-${tab.id}-btn`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={isCollapsed ? `${tab.label} — ${tab.description}` : undefined}
              className={`w-full flex items-center rounded-xl transition text-left group ${
                isCollapsed ? 'justify-center p-2' : 'space-x-3 px-3 py-2'
              } ${
                isActive 
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <div 
                className={`p-1.5 rounded-lg shrink-0 ${
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-800 text-slate-400 group-hover:text-slate-200 group-hover:bg-slate-700/80'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-semibold truncate ${isActive ? 'text-blue-300' : 'text-slate-200'}`}>
                    {tab.label}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
                    {tab.description}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Status Widget */}
      <div className="mt-auto pt-3 border-t border-slate-800">
        {isCollapsed ? (
          <div 
            title="CAN Bus: Active (Load: 24.5%, Errors: 0)" 
            className="flex items-center justify-center p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-emerald-400 hover:bg-slate-800/60 transition cursor-pointer"
          >
            <Activity className="w-4 h-4" />
          </div>
        ) : (
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 text-xs">
            <div className="font-medium text-slate-300 mb-1 flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>CAN Bus Status</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px] mb-0.5">
              <span>Bus Load:</span>
              <span className="text-emerald-400 font-mono">24.5%</span>
            </div>
            <div className="flex justify-between text-slate-400 text-[11px]">
              <span>Error Frames:</span>
              <span className="text-emerald-400 font-mono">0</span>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

