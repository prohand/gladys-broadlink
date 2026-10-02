// -----------------------------------------------------------------------------
// Device commands, per Broadlink protocol family.
//
// Each function takes a BroadlinkClient (already bound to one device) and the
// protocol name from models.js. Payload layouts follow python-broadlink.
// -----------------------------------------------------------------------------

import { PACKET_TYPES } from './protocol.js';

const { COMMAND, SP1_SET_POWER } = PACKET_TYPES;

// =============================================================================
// Universal remotes (RM family)
// =============================================================================

// Old firmwares (RM mini 3 / RM pro) vs new ones (RM4, "rmminib"), which wrap
// every command with a 2-byte length prefix.
const WRAPPED_REMOTE_PROTOCOLS = new Set(['rmminib', 'rm4mini', 'rm4pro']);

const REMOTE_COMMANDS = {
  READ_SENSORS_LEGACY: 0x01,
  SEND_DATA: 0x02,
  ENTER_LEARNING: 0x03,
  CHECK_DATA: 0x04,
  SWEEP_FREQUENCY: 0x19,
  CHECK_FREQUENCY: 0x1a,
  FIND_RF_PACKET: 0x1b,
  CANCEL_SWEEP: 0x1e,
  READ_SENSORS: 0x24,
};

/**
 * Send a remote command and return the useful part of the answer.
 * @param {import('./client.js').BroadlinkClient} client
 * @param {string} protocol
 * @param {number} command
 * @param {Buffer} [data]
 */
export async function remoteCommand(client, protocol, command, data = Buffer.alloc(0)) {
  if (WRAPPED_REMOTE_PROTOCOLS.has(protocol)) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(data.length + 4, 0);
    header.writeUInt32LE(command, 2);
    const response = await client.send(COMMAND, Buffer.concat([header, data]));
    const length = response.readUInt16LE(0);
    return response.subarray(6, length + 2);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(command, 0);
  const response = await client.send(COMMAND, Buffer.concat([header, data]));
  return response.subarray(4);
}

export function sendCode(client, protocol, code) {
  return remoteCommand(client, protocol, REMOTE_COMMANDS.SEND_DATA, code);
}

export function enterLearning(client, protocol) {
  return remoteCommand(client, protocol, REMOTE_COMMANDS.ENTER_LEARNING);
}

/** Last captured code. Throws (device error) while nothing was captured. */
export function checkData(client, protocol) {
  return remoteCommand(client, protocol, REMOTE_COMMANDS.CHECK_DATA);
}

export function sweepFrequency(client, protocol) {
  return remoteCommand(client, protocol, REMOTE_COMMANDS.SWEEP_FREQUENCY);
}

/** @returns {Promise<{ found: boolean, frequency: number }>} frequency in MHz */
export async function checkFrequency(client, protocol) {
  const response = await remoteCommand(client, protocol, REMOTE_COMMANDS.CHECK_FREQUENCY);
  return {
    found: response[0] === 1,
    frequency: response.length >= 5 ? response.readUInt32LE(1) / 1000 : 0,
  };
}

export function findRfPacket(client, protocol, frequency) {
  const data = Buffer.alloc(frequency ? 4 : 0);
  if (frequency) data.writeUInt32LE(Math.round(frequency * 1000), 0);
  return remoteCommand(client, protocol, REMOTE_COMMANDS.FIND_RF_PACKET, data);
}

export function cancelSweep(client, protocol) {
  return remoteCommand(client, protocol, REMOTE_COMMANDS.CANCEL_SWEEP);
}

/**
 * Built-in (RM pro) or cable (RM4 + HTS2) sensors.
 * @returns {Promise<{ temperature: number, humidity?: number } | null>}
 *   null when the model has no sensor at all
 */
export async function readRemoteSensors(client, protocol) {
  if (protocol === 'rm4mini' || protocol === 'rm4pro') {
    const r = await remoteCommand(client, protocol, REMOTE_COMMANDS.READ_SENSORS);
    return {
      temperature: round(r.readInt8(0) + r.readInt8(1) / 100),
      humidity: round(r[2] + r[3] / 100),
    };
  }
  if (protocol === 'rmpro') {
    const r = await remoteCommand(client, protocol, REMOTE_COMMANDS.READ_SENSORS_LEGACY);
    return { temperature: round(r.readInt8(0) + r.readInt8(1) / 10) };
  }
  return null;
}

// =============================================================================
// Smart plugs (SP family)
// =============================================================================

/** Plug protocols able to report their relay state. */
export const PLUG_READS_STATE = new Set(['sp2', 'sp2s', 'sp3', 'sp3s', 'sp4', 'sp4b']);

/** Plug protocols always able to report their instantaneous power (W). */
export const PLUG_READS_POWER = new Set(['sp2s', 'sp3s']);

function legacyPlugPayload(first, value = 0) {
  const payload = Buffer.alloc(16);
  payload[0] = first;
  payload[4] = value;
  return payload;
}

// --- SP4 / SP4B: JSON messages -----------------------------------------------

export function encodeJsonMessage(protocol, flag, state) {
  const data = Buffer.from(JSON.stringify(state), 'utf8');
  if (protocol === 'sp4b') {
    const header = Buffer.alloc(14);
    header.writeUInt16LE(12 + data.length, 0);
    header.writeUInt16LE(0xa5a5, 2);
    header.writeUInt16LE(0x5a5a, 4);
    header.writeUInt16LE(0x0000, 6);
    header[8] = flag;
    header[9] = 0x0b;
    header.writeUInt32LE(data.length, 10);
    const packet = Buffer.concat([header, data]);
    packet.writeUInt16LE(checksumFrom(packet, 2), 6);
    return packet;
  }
  const header = Buffer.alloc(12);
  header.writeUInt16LE(0xa5a5, 0);
  header.writeUInt16LE(0x5a5a, 2);
  header.writeUInt16LE(0x0000, 4);
  header[6] = flag;
  header[7] = 0x0b;
  header.writeUInt32LE(data.length, 8);
  const packet = Buffer.concat([header, data]);
  packet.writeUInt16LE(checksumFrom(packet, 0), 4);
  return packet;
}

export function decodeJsonMessage(protocol, payload) {
  const offset = protocol === 'sp4b' ? 0x0a : 0x08;
  const length = payload.readUInt32LE(offset);
  return JSON.parse(payload.subarray(offset + 4, offset + 4 + length).toString('utf8'));
}

async function jsonRequest(client, protocol, flag, state) {
  const response = await client.send(COMMAND, encodeJsonMessage(protocol, flag, state));
  return decodeJsonMessage(protocol, response);
}

/**
 * @returns {Promise<{ on: boolean | null, power: number | null }>}
 */
export async function getPlugState(client, protocol) {
  switch (protocol) {
    case 'sp2':
    case 'sp2s':
    case 'sp3s': {
      const response = await client.send(COMMAND, legacyPlugPayload(1));
      const on = Boolean(response[4]);
      return {
        on,
        power: PLUG_READS_POWER.has(protocol) ? await getPlugPower(client, protocol) : null,
      };
    }
    case 'sp3': {
      const response = await client.send(COMMAND, legacyPlugPayload(1));
      return { on: Boolean(response[4] & 1), power: null };
    }
    case 'sp4':
    case 'sp4b': {
      const state = await jsonRequest(client, protocol, 1, {});
      const power =
        protocol === 'sp4b' && typeof state.power === 'number' && state.power !== -1
          ? round(state.power / 1000)
          : null;
      return { on: Boolean(state.pwr), power };
    }
    default:
      return { on: null, power: null };
  }
}

async function getPlugPower(client, protocol) {
  if (protocol === 'sp2s') {
    const response = await client.send(COMMAND, legacyPlugPayload(4));
    return round(response.readUIntLE(4, 3) / 1000);
  }
  // SP3S: BCD encoded, hundredths of a watt.
  const response = await client.send(COMMAND, Buffer.from([8, 0, 254, 1, 5, 1, 0, 0, 0, 45]));
  const bcd = Buffer.from([response[7], response[6], response[5]]).toString('hex');
  return Number.parseInt(bcd, 10) / 100;
}

export async function setPlugPower(client, protocol, on) {
  switch (protocol) {
    case 'sp1':
      await client.send(SP1_SET_POWER, Buffer.from([on ? 1 : 0, 0, 0, 0]));
      return;
    case 'sp3': {
      // Keep the night light bit as it is.
      const current = await client.send(COMMAND, legacyPlugPayload(1));
      await client.send(COMMAND, legacyPlugPayload(2, (current[4] & 2) | (on ? 1 : 0)));
      return;
    }
    case 'sp4':
    case 'sp4b':
      await jsonRequest(client, protocol, 2, { pwr: on ? 1 : 0 });
      return;
    default:
      await client.send(COMMAND, legacyPlugPayload(2, on ? 1 : 0));
  }
}

// =============================================================================
// Power strip (MP1): 4 outlets driven by a bit mask
// =============================================================================

export const STRIP_OUTLETS = 4;

/** @returns {Promise<boolean[]>} one entry per outlet */
export async function getStripState(client) {
  const payload = Buffer.alloc(16);
  payload.set([0x0a, 0x00, 0xa5, 0xa5, 0x5a, 0x5a, 0xae, 0xc0, 0x01]);
  const response = await client.send(COMMAND, payload);
  const mask = response[0x0e];
  return Array.from({ length: STRIP_OUTLETS }, (_, i) => Boolean(mask & (1 << i)));
}

/** @param {number} outlet 1..4 */
export async function setStripOutlet(client, outlet, on) {
  const mask = 1 << (outlet - 1);
  const payload = Buffer.alloc(16);
  payload[0x00] = 0x0d;
  payload[0x02] = 0xa5;
  payload[0x03] = 0xa5;
  payload[0x04] = 0x5a;
  payload[0x05] = 0x5a;
  payload[0x06] = 0xb2 + (on ? mask << 1 : mask);
  payload[0x07] = 0xc0;
  payload[0x08] = 0x02;
  payload[0x0a] = 0x03;
  payload[0x0d] = mask;
  payload[0x0e] = on ? mask : 0;
  await client.send(COMMAND, payload);
}

// =============================================================================
// Environment sensor (A1)
// =============================================================================

/** @returns {Promise<{ temperature: number, humidity: number }>} */
export async function readA1Sensors(client) {
  const response = await client.send(COMMAND, Buffer.from([0x01]));
  return {
    temperature: round(response[0x04] + response[0x05] / 10),
    humidity: round(response[0x06] + response[0x07] / 10),
  };
}

// =============================================================================

function checksumFrom(buffer, start) {
  let sum = 0xbeaf;
  for (let i = start; i < buffer.length; i += 1) sum += buffer[i];
  return sum & 0xffff;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
