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
import { PlaybackView } from './components/PlaybackView';
import { FuzzingView } from './components/FuzzingView';
import { BisectorView } from './components/BisectorView';
import { FileComparatorView } from './components/FileComparatorView';
import { BookmarkManagerView, AutoArmConfig } from './components/BookmarkManagerView';
import { CanBridgeView } from './components/CanBridgeView';
import { ConnectionsView } from './components/ConnectionsView';
import { ConnectionModal } from './components/ConnectionModal';
import { ImportModal } from './components/ImportModal';
import { MobileCompanionView } from './components/MobileCompanionView';
import { PlaybackStatusBar } from './components/PlaybackStatusBar';
import { INITIAL_CONNECTIONS, INITIAL_DBC_MESSAGES, generateInitialCANFrames } from './data/mockData';
import { CANFrame, ConnectionConfig, DBCMessage, ScriptItem, Bookmark, CANMessageTrigger } from './types';

const INITIAL_CAN_TRIGGERS: CANMessageTrigger[] = [
  {
    id: 'trig-steering-btn',
    name: 'Steering Wheel Button (Cruise/Media)',
    enabled: true,
    canId: '0x156',
    targetByte: 1, // Byte D1
    condition: 'equals',
    expectedHex: '0x24',
    maskHex: '0xFF',
    autoDisableOnTrigger: false,
    cooldownMs: 800,
    notes: 'Triggered when steering wheel button is depressed (Byte D1 == 0x24)'
  },
  {
    id: 'trig-brake-switch',
    name: 'Brake Pedal Switch Active',
    enabled: false,
    canId: '0x201',
    targetByte: 4, // Byte D4
    condition: 'equals',
    expectedHex: '0x02',
    maskHex: '0xFF',
    autoDisableOnTrigger: false,
    cooldownMs: 1000,
    notes: 'Brake switch contact closed (Byte D4 == 0x02)'
  },
  {
    id: 'trig-abs-pulse',
    name: 'ABS Wheel Slip Event',
    enabled: false,
    canId: '0x320',
    targetByte: 5, // Byte D5
    condition: 'equals',
    expectedHex: '0x01',
    maskHex: '0xFF',
    autoDisableOnTrigger: true,
    cooldownMs: 1500,
    notes: 'ABS intervention flag detected on Byte D5'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('sniffer');
  const [frames, setFrames] = useState<CANFrame[]>(() => generateInitialCANFrames());
  const [connections, setConnections] = useState<ConnectionConfig[]>(INITIAL_CONNECTIONS);
  const [dbcMessages, setDbcMessages] = useState<DBCMessage[]>(INITIAL_DBC_MESSAGES);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [canTriggers, setCanTriggers] = useState<CANMessageTrigger[]>(INITIAL_CAN_TRIGGERS);
  const [snifferFilterTerm, setSnifferFilterTerm] = useState('');
  const [isCapturing, setIsCapturing] = useState(true);
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Trace Playback Engine State (Read-only replay through recorded buffer - NO re-recording)
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [selectedPlaybackFrame, setSelectedPlaybackFrame] = useState<CANFrame | null>(null);

  // SavvyLens Auto-Arm Configuration
  const [autoArm, setAutoArm] = useState<AutoArmConfig>({
    enabled: false,
    autoDisableOnTrigger: true,
    deltaWindowMs: 500,
    triggerCondition: 'any_new_id'
  });

  // High-performance Buffer Limit & Message Rate tracking for Windows/Heavy captures
  const [bufferLimit, setBufferLimit] = useState<number>(50000);
  const [messageRate, setMessageRate] = useState<number>(0);
  const frameCountWindowRef = useRef<{ count: number; lastTime: number }>({ count: 0, lastTime: Date.now() });

  // O(1) Last Frame Lookup Map by CAN ID (eliminates O(N) array clone and reverse search)
  const lastFrameByIdRef = useRef<Map<string, CANFrame>>(new Map());

  // Populate O(1) map from initial frames
  useEffect(() => {
    frames.forEach(f => {
      lastFrameByIdRef.current.set(f.id.toLowerCase(), f);
    });
  }, []);

  // Periodic Message Rate calculation (1Hz update)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - frameCountWindowRef.current.lastTime) / 1000;
      if (elapsedSec >= 0.8) {
        const rate = Math.round(frameCountWindowRef.current.count / elapsedSec);
        setMessageRate(rate);
        frameCountWindowRef.current = { count: 0, lastTime: now };
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const framesRef = useRef(frames);
  framesRef.current = frames;

  const autoArmRef = useRef(autoArm);
  autoArmRef.current = autoArm;

  const canTriggersRef = useRef(canTriggers);
  canTriggersRef.current = canTriggers;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const handleClearFrames = () => {
    lastFrameByIdRef.current.clear();
    setFrames([]);
    showToast('SavvyLens: Frame buffer cleared');
  };

  // SavvyLens Bookmark Creation & Temporal Delta-Window Correlation Engine
  const handleCreateBookmark = useCallback((
    title?: string, 
    description?: string, 
    triggerMode: 'Manual' | 'Shortcut' | 'Auto-Armed' | 'CAN-Triggered' = 'Manual',
    extraData?: Partial<Bookmark>
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
      triggerMode,
      ...extraData
    };

    setBookmarks(prev => [newBm, ...prev]);

    // Auto-disable detector if armed
    if (triggerMode === 'Auto-Armed' && currentArm.enabled && currentArm.autoDisableOnTrigger) {
      setAutoArm(prev => ({ ...prev, enabled: false }));
      showToast(`SavvyLens: Auto-Arm triggered and auto-disabled. Recorded ${newIdsDetected.length} new ID(s).`);
    } else if (triggerMode === 'CAN-Triggered') {
      showToast(`SavvyLens: CAN Trigger fired: ${extraData?.matchedTriggerName || title} (${extraData?.matchedByteLabel || ''})`);
    } else {
      showToast(`SavvyLens: Bookmark recorded (+${currentTs.toFixed(2)}s)`);
    }

    return newBm;
  }, []);

  // CAN Message Trigger Evaluator (e.g. Steering wheel button, pedal switches)
  const evaluateFrameForTriggers = useCallback((frame: CANFrame) => {
    const triggers = canTriggersRef.current;
    if (!triggers || triggers.length === 0) return;

    const now = Date.now();
    const normalizedFrameId = frame.id.toLowerCase().replace('0x', '');

    triggers.forEach(trigger => {
      if (!trigger.enabled) return;

      const normalizedTriggerId = trigger.canId.toLowerCase().replace('0x', '');
      if (normalizedFrameId !== normalizedTriggerId) return;

      // Cooldown check
      if (trigger.lastTriggeredTimestamp && (now - trigger.lastTriggeredTimestamp < (trigger.cooldownMs || 500))) {
        return;
      }

      let isMatch = false;
      let byteLabel = 'Any Byte';
      const targetB = trigger.targetByte; // 1 to 8 (D1 to D8), or 0 for Any

      if (targetB === 0 || trigger.condition === 'any_message') {
        isMatch = true;
        byteLabel = `Any frame on ${frame.id}`;
      } else if (targetB >= 1 && targetB <= 8) {
        const bIdx = targetB - 1;
        const actualByte = frame.data[bIdx] ?? 0;
        const expectedByte = parseInt(trigger.expectedHex.replace('0x', ''), 16) || 0;
        const mask = trigger.maskHex ? (parseInt(trigger.maskHex.replace('0x', ''), 16) || 0xFF) : 0xFF;

        byteLabel = `Byte D${targetB}`;

        if (trigger.condition === 'equals') {
          isMatch = (actualByte & mask) === (expectedByte & mask);
          byteLabel += ` == 0x${expectedByte.toString(16).toUpperCase().padStart(2, '0')}`;
        } else if (trigger.condition === 'mask_set') {
          isMatch = (actualByte & mask) !== 0;
          byteLabel += ` & 0x${mask.toString(16).toUpperCase().padStart(2, '0')} != 0`;
        } else if (trigger.condition === 'changed') {
          isMatch = !!frame.changedBytes?.[bIdx];
          byteLabel += ` changed`;
        }
      }

      if (isMatch) {
        trigger.lastTriggeredTimestamp = now;
        if (trigger.autoDisableOnTrigger) {
          setCanTriggers(prev => prev.map(t => t.id === trigger.id ? { ...t, enabled: false } : t));
        }

        const payloadStr = frame.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

        handleCreateBookmark(
          trigger.name,
          `Mapped CAN trigger matched on ${frame.id} (${byteLabel}). Payload: [${payloadStr}]`,
          'CAN-Triggered',
          {
            matchedTriggerName: trigger.name,
            matchedCanId: frame.id,
            matchedByteLabel: byteLabel,
            matchedPayload: payloadStr
          }
        );
      }
    });
  }, [handleCreateBookmark]);

  const evaluateFrameForTriggersRef = useRef(evaluateFrameForTriggers);
  evaluateFrameForTriggersRef.current = evaluateFrameForTriggers;

  // Simulate receiving a mapped CAN trigger frame (e.g. steering wheel button push)
  const handleSimulateCanTrigger = (trigger: CANMessageTrigger) => {
    const currentFrames = framesRef.current;
    const lastTs = currentFrames.length > 0 ? currentFrames[currentFrames.length - 1].timestamp : 120.0;
    const newTs = Number((lastTs + 0.05).toFixed(3));

    const data = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const expectedByte = parseInt(trigger.expectedHex.replace('0x', ''), 16) || 0x24;

    if (trigger.targetByte >= 1 && trigger.targetByte <= 8) {
      data[trigger.targetByte - 1] = expectedByte;
    } else {
      data[0] = expectedByte;
    }

    const lastMatch = lastFrameByIdRef.current.get(trigger.canId.toLowerCase());
    const changedBytes = data.map((b, i) => !lastMatch || lastMatch.data[i] !== b);
    const changedBits = data.map((b, i) => lastMatch ? ((lastMatch.data[i] ^ b) & 0xFF) : 0);

    const simFrame: CANFrame = {
      id: trigger.canId,
      decimalId: parseInt(trigger.canId.replace('0x', ''), 16) || 342,
      name: trigger.name,
      timestamp: newTs,
      bus: 0,
      dlc: 8,
      data,
      ascii: data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
      count: lastMatch ? lastMatch.count + 1 : 1,
      direction: 'RX',
      changedBytes,
      changedBits,
      prevData: lastMatch ? lastMatch.data : undefined,
      isNewId: !lastMatch
    };

    lastFrameByIdRef.current.set(simFrame.id.toLowerCase(), simFrame);
    frameCountWindowRef.current.count += 1;

    setFrames(prev => {
      const next = [...prev, simFrame];
      return bufferLimit > 0 && next.length > bufferLimit ? next.slice(next.length - bufferLimit) : next;
    });

    evaluateFrameForTriggers(simFrame);
    showToast(`SavvyLens: Transmitted simulated trigger frame for ${trigger.name}`);
  };

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

  // Read-only Playback Engine Loop (Advances timeline without appending or recording frames)
  useEffect(() => {
    if (isCapturing || !isPlaybackActive || frames.length === 0) return;

    const maxTime = frames[frames.length - 1]?.timestamp || 0;
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setPlaybackTime(prev => {
        const next = prev + dt * playbackSpeed;
        if (next >= maxTime) {
          setIsPlaybackActive(false);
          return maxTime;
        }
        return next;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isCapturing, isPlaybackActive, playbackSpeed, frames]);

  // Sync selectedPlaybackFrame to current playbackTime cursor
  useEffect(() => {
    if (isCapturing || frames.length === 0) return;

    let low = 0;
    let high = frames.length - 1;
    let bestIdx = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (frames[mid].timestamp <= playbackTime) {
        bestIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const target = frames[bestIdx];
    if (!selectedPlaybackFrame || selectedPlaybackFrame.timestamp !== target.timestamp || selectedPlaybackFrame.id !== target.id) {
      setSelectedPlaybackFrame(target);
    }
  }, [playbackTime, isCapturing, frames, selectedPlaybackFrame]);

  // Step Frame forward or backward in recorded history
  const handleStepPlaybackFrame = (dir: 'forward' | 'backward') => {
    if (isCapturing || frames.length === 0) return;
    setIsPlaybackActive(false);

    const currIdx = selectedPlaybackFrame 
      ? frames.findIndex(f => f.id === selectedPlaybackFrame.id && Math.abs(f.timestamp - selectedPlaybackFrame.timestamp) < 0.0001)
      : 0;

    const nextIdx = dir === 'forward'
      ? Math.min(frames.length - 1, (currIdx >= 0 ? currIdx + 1 : 0))
      : Math.max(0, (currIdx >= 0 ? currIdx - 1 : 0));

    const target = frames[nextIdx];
    if (target) {
      setPlaybackTime(target.timestamp);
      setSelectedPlaybackFrame(target);
    }
  };

  const handleJumpToPlaybackStart = () => {
    if (isCapturing || frames.length === 0) return;
    setIsPlaybackActive(false);
    if (frames.length > 0) {
      setPlaybackTime(frames[0].timestamp);
      setSelectedPlaybackFrame(frames[0]);
    }
  };

  const handleJumpToPlaybackEnd = () => {
    if (isCapturing || frames.length === 0) return;
    setIsPlaybackActive(false);
    if (frames.length > 0) {
      setPlaybackTime(frames[frames.length - 1].timestamp);
      setSelectedPlaybackFrame(frames[frames.length - 1]);
    }
  };

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

      const lastMatch = lastFrameByIdRef.current.get(id.toLowerCase());
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

      lastFrameByIdRef.current.set(newFrame.id.toLowerCase(), newFrame);
      frameCountWindowRef.current.count += 1;

      setFrames(prev => {
        const next = [...prev, newFrame];
        return bufferLimit > 0 && next.length > bufferLimit ? next.slice(next.length - bufferLimit) : next;
      });

      // Evaluate simulated traffic against mapped CAN triggers
      evaluateFrameForTriggersRef.current(newFrame);
    }, 500);

    return () => clearInterval(interval);
  }, [isCapturing, bufferLimit]);

  // Handle Transmitting Frame with SavvyLens Bit & Byte Change Tracking
  const handleSendCustomFrame = (id: string, data: number[]) => {
    const decId = parseInt(id.replace('0x', ''), 16);
    const prevFrames = framesRef.current;
    
    // O(1) Lookup of previous frame with identical ID
    const lastMatchingFrame = lastFrameByIdRef.current.get(id.toLowerCase());
    
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

    lastFrameByIdRef.current.set(newFrame.id.toLowerCase(), newFrame);
    frameCountWindowRef.current.count += 1;

    setFrames(prev => {
      const next = [...prev, newFrame];
      return bufferLimit > 0 && next.length > bufferLimit ? next.slice(next.length - bufferLimit) : next;
    });
    evaluateFrameForTriggers(newFrame);

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
    setIsImportModalOpen(true);
  };

  const handleImportFrames = (newFrames: CANFrame[], replace: boolean) => {
    // Enrich imported frames with existing DBC message names if missing
    const dbcMap = new Map(dbcMessages.map(m => [m.hexId.toLowerCase(), m.name]));
    const enriched = newFrames.map(f => {
      if (!f.name) {
        const found = dbcMap.get(f.id.toLowerCase());
        if (found) return { ...f, name: found };
      }
      return f;
    });

    if (replace) {
      lastFrameByIdRef.current.clear();
      enriched.forEach(f => lastFrameByIdRef.current.set(f.id.toLowerCase(), f));
      setFrames(enriched);
      showToast(`SavvyLens: Loaded ${enriched.length.toLocaleString()} CAN frames (Buffer Replaced)`);
    } else {
      enriched.forEach(f => lastFrameByIdRef.current.set(f.id.toLowerCase(), f));
      setFrames(prev => {
        const next = [...prev, ...enriched];
        return bufferLimit > 0 && next.length > bufferLimit ? next.slice(next.length - bufferLimit) : next;
      });
      showToast(`SavvyLens: Appended ${enriched.length.toLocaleString()} CAN frames to feed`);
    }
  };

  const handleImportDbc = (importedDbc: DBCMessage[], replace: boolean) => {
    if (replace) {
      setDbcMessages(importedDbc);
      showToast(`SavvyLens: Loaded ${importedDbc.length} DBC message definitions`);
    } else {
      setDbcMessages(prev => {
        const incomingIds = new Set(importedDbc.map(m => m.hexId.toLowerCase()));
        return [...importedDbc, ...prev.filter(m => !incomingIds.has(m.hexId.toLowerCase()))];
      });
      showToast(`SavvyLens: Merged ${importedDbc.length} DBC definitions`);
    }

    // Auto-update active frames with matching DBC names
    const dbcMap = new Map(importedDbc.map(m => [m.hexId.toLowerCase(), m.name]));
    setFrames(prev => prev.map(f => {
      const matchName = dbcMap.get(f.id.toLowerCase());
      return matchName ? { ...f, name: matchName } : f;
    }));
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
        bufferLimit={bufferLimit}
        onBufferLimitChange={setBufferLimit}
        messageRate={messageRate}
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
          {activeTab === 'mobile-companion' && (
            <MobileCompanionView
              frames={frames}
              connections={connections}
              bookmarks={bookmarks}
              dbcMessages={dbcMessages}
              canTriggers={canTriggers}
              isCapturing={isCapturing}
              setIsCapturing={setIsCapturing}
              handleClearFrames={handleClearFrames}
              handleConnectDevice={handleConnectDevice}
              handleSendCustomFrame={handleSendCustomFrame}
              handleCreateBookmark={handleCreateBookmark}
              showToast={showToast}
            />
          )}
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
              onAddCanTrigger={(trig) => {
                setCanTriggers(prev => [...prev, trig]);
                showToast(`SavvyLens: Mapped CAN trigger added for ${trig.name}`);
              }}
              initialSearchTerm={snifferFilterTerm}
              isCapturing={isCapturing}
              onToggleCapture={() => {
                setIsCapturing(prev => {
                  const next = !prev;
                  if (next) setIsPlaybackActive(false);
                  return next;
                });
              }}
              playbackFrame={selectedPlaybackFrame}
              isPlaybackActive={isPlaybackActive}
              playbackTime={playbackTime}
            />
          )}
          {activeTab === 'playback' && (
            <PlaybackView frames={frames} />
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
              canTriggers={canTriggers}
              setCanTriggers={setCanTriggers}
              onSimulateCanTrigger={handleSimulateCanTrigger}
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
        setIsCapturing={val => {
          setIsCapturing(val);
          if (val) setIsPlaybackActive(false);
        }}
        frameCount={frames.length}
        frames={frames}
        playbackTime={playbackTime}
        setPlaybackTime={setPlaybackTime}
        isPlaybackActive={isPlaybackActive}
        setIsPlaybackActive={setIsPlaybackActive}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        onStepFrame={handleStepPlaybackFrame}
        onJumpToStart={handleJumpToPlaybackStart}
        onJumpToEnd={handleJumpToPlaybackEnd}
      />

      <ConnectionModal
        isOpen={isConnModalOpen}
        onClose={() => setIsConnModalOpen(false)}
        connections={connections}
        setConnections={setConnections}
        onConnectDevice={handleConnectDevice}
      />

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportFrames={handleImportFrames}
        onImportDbc={handleImportDbc}
        activeFrameCount={frames.length}
      />
    </div>
  );
}
