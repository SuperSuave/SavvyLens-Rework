import { DBCMessage, CANFrame, ScriptItem, ConnectionConfig } from '../types';

export const INITIAL_CONNECTIONS: ConnectionConfig[] = [
  {
    id: 'conn-socketcan-01',
    name: 'can0 (SocketCAN)',
    type: 'SocketCAN',
    status: 'Disconnected',
    baudRate: 500000,
    port: 'can0',
    isLogging: false
  }
];

export const INITIAL_DBC_MESSAGES: DBCMessage[] = [];

export const INITIAL_SCRIPTS: ScriptItem[] = [
  {
    id: 's1',
    name: 'Alive Counter Replay',
    description: 'Generates cycling alive counter 0-15 on Byte 0 with CRC update',
    enabled: true,
    code: '// SavvyLens Automotive alive counter loop\nfor(let i=0; i<16; i++) {\n  sendFrame("0x201", [i, 0x12, 0x34, 0x00, 0x00, 0x00, 0x00, (i ^ 0xAA) & 0xFF]);\n}'
  }
];

/**
 * Generate a realistic initial sequence of automotive CAN bus traffic
 * featuring periodic rolling counters, continuous analog sensors,
 * discrete gear changes, and correlated brake/throttle burst events.
 */
export function generateInitialCANFrames(): CANFrame[] {
  const frames: CANFrame[] = [];
  const baseTime = 120.450;
  
  // Track previous frames for change detection
  const lastPayloads: Record<string, number[]> = {};

  const templates = [
    { id: '0x201', name: 'ECM_Engine_Status', dlc: 8, bus: 0 },
    { id: '0x156', name: 'SAS_Steering_Angle', dlc: 8, bus: 0 },
    { id: '0x1F5', name: 'TCM_Transmission_State', dlc: 8, bus: 0 },
    { id: '0x320', name: 'ABS_Wheel_Speeds', dlc: 8, bus: 0 },
    { id: '0x0A0', name: 'BCM_Brake_Actuator', dlc: 8, bus: 0 },
    { id: '0x480', name: 'BCM_Lighting_Doors', dlc: 8, bus: 0 }
  ];

  let currentTime = baseTime;
  let rpm = 1850;
  let steeringAngle = 120;
  let gear = 4; // Drive

  for (let cycle = 0; cycle < 18; cycle++) {
    // 1. ECM Frame (Every cycle, 20ms period)
    const ecmAlive = cycle % 16;
    rpm += Math.floor((Math.random() - 0.45) * 40);
    const rpmLow = rpm & 0xFF;
    const rpmHigh = (rpm >> 8) & 0xFF;
    const throttle = Math.min(100, Math.max(15, Math.floor(rpm / 50)));
    const ecmCrc = (ecmAlive ^ rpmLow ^ rpmHigh ^ throttle ^ 0x55) & 0xFF;
    const ecmData = [ecmAlive, rpmLow, rpmHigh, throttle, 0x00, 0x02, 0x10, ecmCrc];
    currentTime += 0.018;

    addFrame('0x201', 513, 'ECM_Engine_Status', ecmData, currentTime);

    // 2. SAS Steering Angle (40ms period)
    if (cycle % 2 === 0) {
      steeringAngle += (cycle % 4 === 0 ? 3 : -2);
      const sasData = [steeringAngle & 0xFF, (steeringAngle >> 8) & 0xFF, 0x24, 0x00, 0x00, 0x00, 0x00, 0x88];
      addFrame('0x156', 342, 'SAS_Steering_Angle', sasData, currentTime + 0.004);
    }

    // 3. Wheel speeds (40ms period)
    if (cycle % 2 === 1) {
      const spd = Math.floor(rpm / 55);
      const absData = [spd, spd, spd, spd, 0x01, 0x00, 0x00, (spd ^ 0xFE) & 0xFF];
      addFrame('0x320', 800, 'ABS_Wheel_Speeds', absData, currentTime + 0.007);
    }

    // 4. Correlated Brake Event at cycle 8-10 (synchronous burst)
    if (cycle === 9) {
      // Brake pressed causes BCM brake frame + TCM torque intervention
      const brakeData = [0x01, 0xFF, 0x80, 0x00, 0x00, 0x00, 0x00, 0xAA];
      addFrame('0x0A0', 160, 'BCM_Brake_Actuator', brakeData, currentTime + 0.002);

      const tcmData = [gear, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F];
      addFrame('0x1F5', 501, 'TCM_Transmission_State', tcmData, currentTime + 0.008);
    }

    // 5. Body Lighting frame (periodic 100ms)
    if (cycle % 5 === 0) {
      const bcmData = [0x04, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      addFrame('0x480', 1152, 'BCM_Lighting_Doors', bcmData, currentTime + 0.012);
    }
  }

  function addFrame(id: string, decimalId: number, name: string, data: number[], ts: number) {
    const prev = lastPayloads[id];
    const isNewId = !prev;
    const changedBytes = data.map((b, i) => !prev || prev[i] !== b);
    const changedBits = data.map((b, i) => prev ? ((prev[i] ^ b) & 0xFF) : 0);
    lastPayloads[id] = [...data];

    frames.push({
      id,
      decimalId,
      name,
      timestamp: Number(ts.toFixed(3)),
      bus: 0,
      dlc: data.length,
      data,
      ascii: data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join(''),
      count: frames.filter(f => f.id === id).length + 1,
      direction: 'RX',
      changedBytes,
      changedBits,
      prevData: prev,
      isNewId
    });
  }

  return frames;
}
