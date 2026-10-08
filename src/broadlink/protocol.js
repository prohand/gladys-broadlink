// -----------------------------------------------------------------------------
// Broadlink LAN protocol: packet framing, checksums and AES encryption.
//
// Pure functions only (no socket here), so everything can be unit-tested.
// Reference implementation: python-broadlink (https://github.com/mjg59/python-broadlink).
//
// Every device speaks UDP on port 80:
//   - a "hello" packet (48 bytes, not encrypted) used for discovery;
//   - "command" packets: a 56-byte clear header + an AES-128-CBC payload.
// -----------------------------------------------------------------------------

import { createCipheriv, createDecipheriv, randomInt } from 'node:crypto';

export const BROADLINK_PORT = 80;

// Default key / IV, shared by every device. The key is replaced by a
// per-session key after authentication; the IV never changes.
export const INITIAL_KEY = Buffer.from('097628343fe99e23765c1513accf8b02', 'hex');
export const INITIAL_IV = Buffer.from('562e17996d093d28ddb3ba695a2e6f58', 'hex');

export const PACKET_TYPES = {
  HELLO: 0x06,
  AUTH: 0x65,
  SP1_SET_POWER: 0x66,
  COMMAND: 0x6a,
};

// Error codes returned by the firmware in the response header.
export const DEVICE_ERRORS = {
  [-1]: 'Authentication failed',
  [-2]: 'You have been logged out',
  [-3]: 'The device is offline',
  [-4]: 'Command not supported',
  [-5]: 'The device storage is full',
  [-6]: 'Structure is abnormal',
  [-7]: 'Control key is expired',
  [-8]: 'Send error',
  [-9]: 'Write error',
  [-10]: 'Read error',
  [-11]: 'SSID could not be found in AP configuration',
};

export class BroadlinkDeviceError extends Error {
  constructor(code) {
    super(`Broadlink error ${code}: ${DEVICE_ERRORS[code] ?? 'Unknown error'}`);
    this.name = 'BroadlinkDeviceError';
    this.code = code;
  }
}

/**
 * The device answered, but with a packet that cannot be read (too short, bad
 * checksum). It is reachable — at the address we know — so this is NOT a
 * reason to flag it unreachable or to scan the network for it again.
 */
export class BroadlinkProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BroadlinkProtocolError';
  }
}

/** Broadlink checksum: 16-bit sum of the bytes, seeded with 0xBEAF. */
export function checksum(buffer) {
  let sum = 0xbeaf;
  for (const byte of buffer) sum += byte;
  return sum & 0xffff;
}

export function encrypt(key, payload) {
  const cipher = createCipheriv('aes-128-cbc', key, INITIAL_IV);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(payload), cipher.final()]);
}

export function decrypt(key, payload) {
  // The ciphertext must be a multiple of the block size: drop any trailing junk.
  const usable = payload.subarray(0, payload.length - (payload.length % 16));
  const decipher = createDecipheriv('aes-128-cbc', key, INITIAL_IV);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(usable), decipher.final()]);
}

/** Pad a payload with zeros up to a multiple of 16 bytes (AES block). */
export function padPayload(payload) {
  const padding = (16 - (payload.length % 16)) % 16;
  return Buffer.concat([payload, Buffer.alloc(padding)]);
}

/** "aa:bb:cc:dd:ee:ff" / "AABBCCDDEEFF" -> "aabbccddeeff". */
export function normalizeMac(mac) {
  return String(mac)
    .replace(/[^0-9a-f]/gi, '')
    .toLowerCase();
}

/** "aabbccddeeff" -> "aa:bb:cc:dd:ee:ff" (for display). */
export function formatMac(mac) {
  return normalizeMac(mac).match(/../g).join(':');
}

/** Next value of the 16-bit packet counter (always keeps the high bit set). */
export function nextCount(count) {
  return ((count + 1) | 0x8000) & 0xffff;
}

export function randomCount() {
  return randomInt(0x8000, 0x10000);
}

/**
 * Build the discovery ("hello") packet. The device answers in unicast to the
 * source address of the datagram, so the local address fields stay at zero.
 * @param {Date} [date]
 */
export function buildHelloPacket(date = new Date()) {
  const packet = Buffer.alloc(0x30);
  const utcOffsetHours = Math.trunc(-date.getTimezoneOffset() / 60);
  packet.writeInt32LE(utcOffsetHours, 0x08);
  packet.writeUInt16LE(date.getFullYear(), 0x0c);
  packet[0x0e] = date.getMinutes();
  packet[0x0f] = date.getHours();
  packet[0x10] = date.getFullYear() % 100;
  packet[0x11] = date.getDay() === 0 ? 7 : date.getDay(); // ISO weekday
  packet[0x12] = date.getDate();
  packet[0x13] = date.getMonth() + 1;
  packet[0x26] = PACKET_TYPES.HELLO;
  packet.writeUInt16LE(checksum(packet), 0x20);
  return packet;
}

/**
 * Parse a discovery answer.
 * @param {Buffer} response
 * @param {string} ip source address of the answer
 * @returns {{ ip: string, mac: string, devtype: number, name: string, locked: boolean } | null}
 */
export function parseHelloResponse(response, ip) {
  if (!Buffer.isBuffer(response) || response.length < 0x40) {
    return null;
  }
  const devtype = response.readUInt16LE(0x34);
  // The MAC travels reversed on the wire.
  const mac = Buffer.from(response.subarray(0x3a, 0x40)).reverse().toString('hex');
  const nameEnd = response.indexOf(0, 0x40);
  const name = response
    .subarray(0x40, nameEnd === -1 ? response.length : nameEnd)
    .toString('utf8')
    .trim();
  const locked = response.length > 0x7f ? Boolean(response[0x7f]) : false;
  return { ip, mac, devtype, name, locked };
}

/**
 * Build an encrypted command packet.
 * @param {{ devtype: number, packetType: number, count: number, mac: string,
 *           id: number, key: Buffer, payload: Buffer }} params
 */
export function buildCommandPacket({ devtype, packetType, count, mac, id, key, payload }) {
  const header = Buffer.alloc(0x38);
  Buffer.from('5aa5aa555aa5aa55', 'hex').copy(header, 0x00);
  header.writeUInt16LE(devtype, 0x24);
  header.writeUInt16LE(packetType, 0x26);
  header.writeUInt16LE(count, 0x28);
  Buffer.from(normalizeMac(mac), 'hex').reverse().copy(header, 0x2a);
  header.writeUInt32LE(id >>> 0, 0x30);
  header.writeUInt16LE(checksum(payload), 0x34);

  const packet = Buffer.concat([header, encrypt(key, padPayload(payload))]);
  packet.writeUInt16LE(checksum(packet), 0x20);
  return packet;
}

/**
 * Validate a command answer and return its decrypted payload.
 * Throws a BroadlinkDeviceError when the device reports an error.
 * @param {Buffer} response
 * @param {Buffer} key
 */
export function parseCommandResponse(response, key) {
  if (response.length < 0x30) {
    throw new BroadlinkProtocolError(`Broadlink response too short (${response.length} bytes)`);
  }
  const expected = response.readUInt16LE(0x20);
  const actual = (checksum(response) - response[0x20] - response[0x21]) & 0xffff;
  if (expected !== actual) {
    throw new BroadlinkProtocolError('Broadlink response checksum mismatch');
  }
  const errorCode = response.readInt16LE(0x22);
  if (errorCode !== 0) {
    throw new BroadlinkDeviceError(errorCode);
  }
  return decrypt(key, response.subarray(0x38));
}

/** Payload of the authentication request. */
export function buildAuthPayload() {
  const payload = Buffer.alloc(0x50);
  payload.fill(0x31, 0x04, 0x14);
  payload[0x1e] = 0x01;
  payload[0x2d] = 0x01;
  payload.write('Test 1', 0x30, 'ascii');
  return payload;
}

/** Extract the session id and key from the decrypted authentication answer. */
export function parseAuthPayload(payload) {
  if (payload.length < 0x14) {
    throw new BroadlinkProtocolError('Broadlink authentication answer too short');
  }
  return {
    id: payload.readUInt32LE(0x00),
    key: Buffer.from(payload.subarray(0x04, 0x14)),
  };
}
