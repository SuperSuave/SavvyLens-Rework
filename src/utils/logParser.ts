import { CANFrame, DBCMessage, DBCSignal } from '../types';

export interface ParseResult {
  type: 'frames' | 'dbc' | 'both';
  frames?: CANFrame[];
  dbcMessages?: DBCMessage[];
  summary: string;
}

/**
 * Parses file contents (.csv, .trc, .log, .asc, .txt, .dbc, .json)
 * and returns parsed CAN frames and/or DBC database definitions.
 */
export function parseCanFile(filename: string, content: string): ParseResult {
  const lowerName = filename.toLowerCase();

  // 1. JSON File
  if (lowerName.endsWith('.json')) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        if (data.length > 0 && ('signals' in data[0] || 'hexId' in data[0])) {
          return {
            type: 'dbc',
            dbcMessages: data as DBCMessage[],
            summary: `Imported ${data.length} DBC message definitions`
          };
        }
        if (data.length > 0 && ('data' in data[0] || 'id' in data[0])) {
          return {
            type: 'frames',
            frames: normalizeFrames(data as CANFrame[]),
            summary: `Imported ${data.length} CAN frames`
          };
        }
      } else if (data && typeof data === 'object') {
        const frames = Array.isArray(data.frames) ? normalizeFrames(data.frames) : [];
        const dbcMessages = Array.isArray(data.dbcMessages) ? data.dbcMessages : [];
        return {
          type: frames.length && dbcMessages.length ? 'both' : dbcMessages.length ? 'dbc' : 'frames',
          frames,
          dbcMessages,
          summary: `Imported ${frames.length} frames & ${dbcMessages.length} DBC definitions`
        };
      }
    } catch {
      // Fall through to text-based parser
    }
  }

  // 2. DBC File
  if (lowerName.endsWith('.dbc') || content.includes('BO_ ') || content.includes('SG_ ')) {
    const dbcMessages = parseDbcContent(content);
    if (dbcMessages.length > 0) {
      return {
        type: 'dbc',
        dbcMessages,
        summary: `Imported ${dbcMessages.length} DBC messages with ${dbcMessages.reduce((acc, m) => acc + m.signals.length, 0)} signals`
      };
    }
  }

  // 3. CSV File (SavvyCAN, SavvyLens, or Generic CSV)
  if (lowerName.endsWith('.csv') || content.includes(',')) {
    const csvFrames = parseCsvContent(content);
    if (csvFrames.length > 0) {
      return {
        type: 'frames',
        frames: normalizeFrames(csvFrames),
        summary: `Imported ${csvFrames.length} CAN frames from CSV`
      };
    }
  }

  // 4. Trace & Log files (candump, PCAN TRC, Vector ASC, etc.)
  const logFrames = parseLogLines(content);
  if (logFrames.length > 0) {
    return {
      type: 'frames',
      frames: normalizeFrames(logFrames),
      summary: `Imported ${logFrames.length} CAN frames from log file`
    };
  }

  throw new Error(`Unable to recognize CAN data in "${filename}". Supported formats: .csv, .trc, .log, .asc, .txt, .dbc, .json.`);
}

/**
 * Normalizes an array of CAN frames, generating missing fields like ascii, changedBytes, and decimalId.
 */
function normalizeFrames(rawFrames: Partial<CANFrame>[]): CANFrame[] {
  const lastPayloads: Record<string, number[]> = {};
  const frameCounts: Record<string, number> = {};

  return rawFrames.map((rf, idx) => {
    let idStr = String(rf.id || '0x000').trim();
    if (!idStr.startsWith('0x') && !idStr.startsWith('0X')) {
      // Check if it's already hex or decimal
      const num = parseInt(idStr, 16);
      idStr = '0x' + (isNaN(num) ? '000' : num.toString(16).toUpperCase());
    } else {
      idStr = '0x' + idStr.replace(/^0x/i, '').toUpperCase();
    }

    const decId = rf.decimalId ?? parseInt(idStr.replace(/^0x/i, ''), 16) ?? 0;
    const data = Array.isArray(rf.data) ? rf.data.map(b => Math.max(0, Math.min(255, Number(b) || 0))) : [];
    const dlc = rf.dlc ?? data.length;
    const ts = typeof rf.timestamp === 'number' && !isNaN(rf.timestamp) ? rf.timestamp : (idx * 0.01);
    const bus = rf.bus ?? 0;
    const direction = rf.direction || 'RX';

    const prev = lastPayloads[idStr];
    const isNewId = !prev;
    const changedBytes = data.map((b, i) => !prev || prev[i] !== b);
    const changedBits = data.map((b, i) => prev ? ((prev[i] ^ b) & 0xFF) : 0);
    lastPayloads[idStr] = [...data];

    frameCounts[idStr] = (frameCounts[idStr] || 0) + 1;

    const ascii = rf.ascii || data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');

    return {
      id: idStr,
      decimalId: decId,
      name: rf.name,
      timestamp: Number(ts.toFixed(4)),
      bus,
      dlc,
      data,
      ascii,
      count: frameCounts[idStr],
      direction,
      changedBytes,
      changedBits,
      prevData: prev,
      isNewId
    };
  });
}

/**
 * Parses Vector DBC format syntax into structured DBCMessage records.
 */
export function parseDbcContent(content: string): DBCMessage[] {
  const messages: DBCMessage[] = [];
  const lines = content.split(/\r?\n/);
  let currentMsg: DBCMessage | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;

    // Match BO_ <ID> <Name>: <DLC> <Sender>
    // e.g. "BO_ 513 ECM_Engine_Status: 8 ECM"
    const boMatch = line.match(/^BO_\s+(\d+)\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\s+([A-Za-z0-9_]+)/);
    if (boMatch) {
      const decId = parseInt(boMatch[1], 10);
      const hexId = '0x' + decId.toString(16).toUpperCase();
      currentMsg = {
        id: decId,
        hexId,
        name: boMatch[2],
        dlc: parseInt(boMatch[3], 10) || 8,
        sender: boMatch[4] || 'Vector_Node',
        signals: []
      };
      messages.push(currentMsg);
      continue;
    }

    // Match SG_ <Name> : <StartBit>|<Length>@<Endianness><Sign> (<Factor>,<Offset>) [<Min>|<Max>] "<Unit>" <Receiver>
    // e.g. " SG_ Alive_Counter : 0|4@1+ (1,0) [0|15] "cnt" All"
    // e.g. " SG_ Engine_RPM : 8|16@1+ (0.25,0) [0|8000] "rpm" All"
    if (currentMsg && line.startsWith('SG_')) {
      const sgMatch = line.match(/^SG_\s+([A-Za-z0-9_]+)\s*(?:m\d+)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"\s+(.+)$/);
      if (sgMatch) {
        const signal: DBCSignal = {
          name: sgMatch[1],
          startBit: parseInt(sgMatch[2], 10),
          length: parseInt(sgMatch[3], 10),
          isBigEndian: sgMatch[4] === '0', // 0 = Motorola (big-endian), 1 = Intel (little-endian)
          isSigned: sgMatch[5] === '-',
          factor: parseFloat(sgMatch[6]) || 1,
          offset: parseFloat(sgMatch[7]) || 0,
          min: parseFloat(sgMatch[8]) || 0,
          max: parseFloat(sgMatch[9]) || 0,
          unit: sgMatch[10] || '',
          receiver: sgMatch[11].split(',').map(r => r.trim()).filter(Boolean)
        };
        currentMsg.signals.push(signal);
      } else {
        // Simpler fallback regex for loose SG_ lines
        const looseMatch = line.match(/^SG_\s+([A-Za-z0-9_]+)\s*:\s*(\d+)\|(\d+)@([01])([+-])/);
        if (looseMatch) {
          currentMsg.signals.push({
            name: looseMatch[1],
            startBit: parseInt(looseMatch[2], 10),
            length: parseInt(looseMatch[3], 10),
            isBigEndian: looseMatch[4] === '0',
            isSigned: looseMatch[5] === '-',
            factor: 1,
            offset: 0,
            min: 0,
            max: Math.pow(2, parseInt(looseMatch[3], 10)) - 1,
            unit: '',
            receiver: ['All']
          });
        }
      }
    }
  }

  return messages;
}

/**
 * Parses CSV CAN logs (supports SavvyCAN, SavvyLens export, and generic CSV).
 */
export function parseCsvContent(content: string): Partial<CANFrame>[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const frames: Partial<CANFrame>[] = [];

  // Identify column indexes
  const tsIdx = headers.findIndex(h => h.includes('time') || h === 'ts');
  const idIdx = headers.findIndex(h => h === 'id' || h.includes('can_id') || h.includes('canid') || h.includes('identifier'));
  const busIdx = headers.findIndex(h => h === 'bus' || h === 'channel');
  const dirIdx = headers.findIndex(h => h.includes('dir') || h === 'direction');
  const nameIdx = headers.findIndex(h => h.includes('name') || h === 'message');
  const dlcIdx = headers.findIndex(h => h === 'dlc' || h === 'len' || h === 'length');
  const dataIdx = headers.findIndex(h => h === 'data' || h === 'payload' || h === 'bytes');

  // SavvyCAN CSV has columns like D1, D2, D3, D4, D5, D6, D7, D8
  const dColIndexes: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    if (/^d\d+$/i.test(headers[i])) {
      dColIndexes.push(i);
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const rawCols = splitCsvLine(lines[i]);
    if (rawCols.length < 2) continue;

    let timestamp = 0;
    if (tsIdx !== -1 && rawCols[tsIdx]) {
      timestamp = parseFloat(rawCols[tsIdx]) || 0;
      // If timestamp is in microseconds or milliseconds from epoch, handle relative scale
      if (timestamp > 1000000000) {
        // Epoch seconds or ms
        if (timestamp > 1000000000000) timestamp = timestamp / 1000;
        // make relative if first frame
        if (frames.length === 0) {
          // keep as is
        }
      }
    } else {
      timestamp = i * 0.01;
    }

    let id = '';
    if (idIdx !== -1 && rawCols[idIdx]) {
      id = rawCols[idIdx].trim().replace(/^["']|["']$/g, '');
    } else {
      continue;
    }

    let bus = 0;
    if (busIdx !== -1 && rawCols[busIdx]) {
      bus = parseInt(rawCols[busIdx], 10) || 0;
    }

    let direction: 'RX' | 'TX' = 'RX';
    if (dirIdx !== -1 && rawCols[dirIdx]) {
      const d = rawCols[dirIdx].trim().toUpperCase();
      if (d.includes('TX') || d === 'T' || d === '1') direction = 'TX';
    }

    let name: string | undefined = undefined;
    if (nameIdx !== -1 && rawCols[nameIdx]) {
      name = rawCols[nameIdx].trim().replace(/^["']|["']$/g, '');
    }

    let dataBytes: number[] = [];
    if (dColIndexes.length > 0) {
      // Individual D0-D7 columns
      dataBytes = dColIndexes.map(ci => {
        const val = rawCols[ci]?.trim();
        if (!val) return 0;
        return val.startsWith('0x') || val.startsWith('0X') ? parseInt(val, 16) : (parseInt(val, 16) || parseInt(val, 10) || 0);
      });
    } else if (dataIdx !== -1 && rawCols[dataIdx]) {
      // Data in a single column (e.g. "01 02 03 04" or "01020304" or "1,2,3")
      dataBytes = parseHexBytes(rawCols[dataIdx]);
    } else {
      // Try to parse trailing columns as bytes
      const remainingCols = rawCols.slice(Math.max(idIdx, tsIdx) + 1);
      if (remainingCols.length > 0) {
        dataBytes = remainingCols.map(c => parseInt(c.trim(), 16)).filter(b => !isNaN(b));
      }
    }

    let dlc = dataBytes.length;
    if (dlcIdx !== -1 && rawCols[dlcIdx]) {
      const parsedDlc = parseInt(rawCols[dlcIdx], 10);
      if (!isNaN(parsedDlc) && parsedDlc > 0) dlc = parsedDlc;
    }

    frames.push({
      id,
      timestamp,
      bus,
      direction,
      name,
      dlc,
      data: dataBytes
    });
  }

  return frames;
}

/**
 * Splits a CSV line taking quotes into account.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let cur = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Parses generic hex byte strings like "01 02 03", "0102030405", "0x01 0x02"
 */
function parseHexBytes(str: string): number[] {
  const cleaned = str.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return [];

  // If space separated
  if (cleaned.includes(' ')) {
    return cleaned.split(/\s+/).map(p => parseInt(p.replace(/^0x/i, ''), 16)).filter(n => !isNaN(n));
  }

  // If comma separated
  if (cleaned.includes(',')) {
    return cleaned.split(',').map(p => parseInt(p.trim().replace(/^0x/i, ''), 16)).filter(n => !isNaN(n));
  }

  // If contiguous hex string like "DEADBEEF0102"
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0) {
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i += 2) {
      bytes.push(parseInt(cleaned.slice(i, i + 2), 16));
    }
    return bytes;
  }

  return [];
}

/**
 * Parses candump, PCAN TRC, Vector ASC, and generic CAN logs line by line.
 */
export function parseLogLines(content: string): Partial<CANFrame>[] {
  const lines = content.split(/\r?\n/);
  const frames: Partial<CANFrame>[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('//') || line.startsWith('date') || line.startsWith('base')) {
      continue;
    }

    // Pattern 1: candump standard format
    // e.g. "(1614774321.123456) can0 123#0102030405060708"
    // e.g. "(0.000000) vcan0 201#0011223344556677"
    const candumpMatch1 = line.match(/\(?([0-9.]+)\)?\s+([a-zA-Z0-9_]+)\s+([0-9a-fA-F]+)#([0-9a-fA-F]*)/);
    if (candumpMatch1) {
      const ts = parseFloat(candumpMatch1[1]);
      const iface = candumpMatch1[2];
      const id = '0x' + candumpMatch1[3].toUpperCase();
      const rawHex = candumpMatch1[4];
      const data: number[] = [];
      for (let i = 0; i < rawHex.length; i += 2) {
        data.push(parseInt(rawHex.slice(i, i + 2), 16));
      }
      const busMatch = iface.match(/\d+/);
      const bus = busMatch ? parseInt(busMatch[0], 10) : 0;

      frames.push({
        id,
        timestamp: ts,
        bus,
        dlc: data.length,
        data,
        direction: 'RX'
      });
      continue;
    }

    // Pattern 2: candump log with bracket length
    // e.g. "can0  123   [8]  01 02 03 04 05 06 07 08"
    // e.g. "120.450  can0  0x123   [8]  01 02 03 04 05 06 07 08"
    const candumpMatch2 = line.match(/(?:([0-9.]+)\s+)?([a-zA-Z0-9_]+)\s+([0-9a-fA-FxX]+)\s+\[(\d+)\]\s+(.*)/);
    if (candumpMatch2) {
      const ts = candumpMatch2[1] ? parseFloat(candumpMatch2[1]) : frames.length * 0.01;
      const iface = candumpMatch2[2];
      let id = candumpMatch2[3];
      if (!id.startsWith('0x') && !id.startsWith('0X')) id = '0x' + id;
      const dlc = parseInt(candumpMatch2[4], 10);
      const data = parseHexBytes(candumpMatch2[5]);
      const busMatch = iface.match(/\d+/);
      const bus = busMatch ? parseInt(busMatch[0], 10) : 0;

      frames.push({
        id,
        timestamp: ts,
        bus,
        dlc: dlc || data.length,
        data,
        direction: 'RX'
      });
      continue;
    }

    // Pattern 3: PCAN Trace (.trc)
    // e.g. "   1)       120.450  Rx  0201  8  01 02 03 04 05 06 07 08"
    const pcanMatch = line.match(/^\d+\)\s+([0-9.]+)\s+(Rx|Tx|RX|TX)\s+([0-9a-fA-F]+)\s+(\d+)\s+(.*)/i);
    if (pcanMatch) {
      const ts = parseFloat(pcanMatch[1]) / 1000; // ms to seconds
      const dir = pcanMatch[2].toUpperCase().includes('TX') ? 'TX' : 'RX';
      const id = '0x' + pcanMatch[3].toUpperCase();
      const dlc = parseInt(pcanMatch[4], 10);
      const data = parseHexBytes(pcanMatch[5]);

      frames.push({
        id,
        timestamp: ts,
        bus: 0,
        dlc,
        data,
        direction: dir
      });
      continue;
    }

    // Pattern 4: Vector ASC format
    // e.g. "   0.123456 1  201             Rx   d 8 01 02 03 04 05 06 07 08"
    const ascMatch = line.match(/^([0-9.]+)\s+(\d+)\s+([0-9a-fA-FxX]+)\s+(Rx|Tx|RX|TX)\s+d\s+(\d+)\s+(.*)/i);
    if (ascMatch) {
      const ts = parseFloat(ascMatch[1]);
      const bus = parseInt(ascMatch[2], 10) - 1; // 1-indexed to 0-indexed
      let id = ascMatch[3];
      if (!id.startsWith('0x') && !id.startsWith('0X')) id = '0x' + id;
      const dir = ascMatch[4].toUpperCase().includes('TX') ? 'TX' : 'RX';
      const dlc = parseInt(ascMatch[5], 10);
      const data = parseHexBytes(ascMatch[6]);

      frames.push({
        id,
        timestamp: ts,
        bus: Math.max(0, bus),
        dlc,
        data,
        direction: dir
      });
      continue;
    }
  }

  return frames;
}
