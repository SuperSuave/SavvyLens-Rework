import React, { useState } from 'react';
import { Bookmark as BookmarkIcon, Plus, Trash2, Clock, Tag } from 'lucide-react';
import { Bookmark } from '../types';

export const BookmarkManagerView: React.FC = () => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([
    { id: 'bm-1', timestamp: 12.45, title: 'Headlights Turned On', description: 'BCM sent status update on CAN bus 1', frameId: '0x318' },
    { id: 'bm-2', timestamp: 45.10, title: 'Inverter Torque Spike', description: 'Maximum acceleration requested by VCM', frameId: '0x123' },
    { id: 'bm-3', timestamp: 88.92, title: 'Door Unlocked', description: 'Remote key fob unlock packet received', frameId: '0x450' }
  ]);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;
    const bm: Bookmark = {
      id: 'bm-' + Date.now(),
      timestamp: Number((Math.random() * 100).toFixed(2)),
      title: newTitle,
      description: newDesc || 'User annotated event',
      frameId: '0x123'
    };
    setBookmarks([...bookmarks, bm]);
    setNewTitle('');
    setNewDesc('');
  };

  const handleDelete = (id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center space-x-2">
              <BookmarkIcon className="w-5 h-5 text-blue-400" />
              <span>Bookmark & Event Correlation Manager</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Annotate timeline timestamps and correlate physical vehicle actions with CAN trace packets</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleAdd} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-slate-300">Add Timeline Bookmark</h3>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Event Title</label>
              <input
                type="text"
                placeholder="e.g. Brake Pedal Pressed"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Description / Notes</label>
              <textarea
                placeholder="Observed ABS pump engage..."
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white h-20 resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
            >
              Add Bookmark at Current Time
            </button>
          </form>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">Recorded Bookmarks ({bookmarks.length})</h3>

            <div className="space-y-3 overflow-auto">
              {bookmarks.map(bm => (
                <div key={bm.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded font-mono text-[10px]">
                        +{bm.timestamp}s
                      </span>
                      <span className="font-bold text-sm text-white">{bm.title}</span>
                      {bm.frameId && <span className="text-[10px] font-mono text-slate-400">ID: {bm.frameId}</span>}
                    </div>
                    <p className="text-xs text-slate-400">{bm.description}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(bm.id)}
                    className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
