// -----------------------------------------------------------------------------
// Protocol encoding. The expected packets were generated with the reference
// implementation (python-broadlink) from the same inputs: if these tests pass,
// the bytes on the wire are identical.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BroadlinkDeviceError,
  INITIAL_KEY,
  PACKET_TYPES,
  buildAuthPayload,
  buildCommandPacket,
  buildHelloPacket,
  checksum,
  decrypt,
  encrypt,
  formatMac,
  nextCount,
  normalizeMac,
  parseCommandResponse,
  parseHelloResponse,
} from '../src/broadlink/protocol.js';
import { encodeJsonMessage, decodeJsonMessage } from '../src/broadlink/commands.js';
import { buildHelloAnswer } from './helpers/fakeBroadlinkDevice.js';

const MAC = '34ea34aabbcc';

test('checksum is the 16-bit sum seeded with 0xBEAF', () => {
  assert.equal(checksum(Buffer.alloc(0)), 0xbeaf);
  assert.equal(checksum(Buffer.from([1, 2, 3])), 0xbeaf + 6);
  assert.equal(checksum(Buffer.alloc(0x200, 0xff)), (0xbeaf + 0x200 * 0xff) & 0xffff);
});

test('the hello packet matches python-broadlink', () => {
  const realTz = process.env.TZ;
  process.env.TZ = 'Etc/GMT-2'; // UTC+2 (POSIX sign is inverted)
  try {
    const packet = buildHelloPacket(new Date('2026-10-02T14:35:00+02:00'));
    assert.equal(
      packet.toString('hex'),
      '000000000000000002000000ea07230e1a05020a00000000000000000000000004c00000000006000000000000000000',
    );
  } finally {
    if (realTz === undefined) delete process.env.TZ;
    else process.env.TZ = realTz;
  }
});

test('command packets match python-broadlink (initial key)', () => {
  const packet = buildCommandPacket({
    devtype: 0x5213,
    packetType: PACKET_TYPES.COMMAND,
    count: 0x8124,
    mac: MAC,
    id: 0,
    key: INITIAL_KEY,
    payload: Buffer.from([0x04, 0x00, 0x24, 0x00, 0x00, 0x00]),
  });
  assert.equal(
    packet.toString('hex'),
    '5aa5aa555aa5aa550000000000000000000000000000000000000000000000008fcf000013526a002481ccbbaa34ea3400000000d7be0000333f5f87119e51bd4558ee9154190eac',
  );
});

test('command packets match python-broadlink (session key and id)', () => {
  const packet = buildCommandPacket({
    devtype: 0x5213,
    packetType: PACKET_TYPES.COMMAND,
    count: 0x9001,
    mac: MAC,
    id: 0x01020304,
    key: Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    payload: Buffer.from(Array.from({ length: 20 }, (_, i) => i)),
  });
  assert.equal(
    packet.toString('hex'),
    '5aa5aa555aa5aa5500000000000000000000000000000000000000000000000000dc000013526a000190ccbbaa34ea34040302016dbf0000e494da80e4c6b0d03b4d6ee8fb6d83ed02fc58e83da4b288bdcf1478e7be2f45',
  );
});

test('the authentication packet matches python-broadlink', () => {
  const packet = buildCommandPacket({
    devtype: 0x5213,
    packetType: PACKET_TYPES.AUTH,
    count: 0x8002,
    mac: MAC,
    id: 0,
    key: INITIAL_KEY,
    payload: buildAuthPayload(),
  });
  assert.equal(
    packet.toString('hex'),
    '5aa5aa555aa5aa55000000000000000000000000000000000000000000000000aef00000135265000280ccbbaa34ea3400000000b2c30000453452e7f92eda958344930835ef9a6d93b0b6da60530408ebba79410b080296f9f7cd7779b46f2513e2c5bbd4450e907fa1ba8fc5e0169776e2620824fff3f85f6f64f7120b1f724ff1b048b76e3e30',
  );
});

test('SP4 / SP4B JSON messages match python-broadlink', () => {
  assert.equal(
    encodeJsonMessage('sp4', 2, { pwr: 1 }).toString('hex'),
    'a5a55a5ac3c3020b090000007b22707772223a317d',
  );
  assert.equal(
    encodeJsonMessage('sp4b', 1, {}).toString('hex'),
    '0e00a5a55a5ab3c1010b020000007b7d',
  );
});

test('JSON messages decode back', () => {
  for (const protocol of ['sp4', 'sp4b']) {
    const encoded = encodeJsonMessage(protocol, 1, { pwr: 1, ntlight: 0 });
    assert.deepEqual(decodeJsonMessage(protocol, encoded), { pwr: 1, ntlight: 0 });
  }
});

test('encrypt / decrypt round trip', () => {
  const clear = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const cipher = encrypt(INITIAL_KEY, clear);
  assert.notDeepEqual(cipher, clear);
  assert.deepEqual(decrypt(INITIAL_KEY, cipher), clear);
});

test('parseHelloResponse extracts devtype, MAC, name and lock state', () => {
  const answer = buildHelloAnswer({ mac: MAC, devtype: 0x5213, name: 'Salon', locked: true });
  assert.deepEqual(parseHelloResponse(answer, '192.168.1.50'), {
    ip: '192.168.1.50',
    mac: MAC,
    devtype: 0x5213,
    name: 'Salon',
    locked: true,
  });
});

test('parseHelloResponse rejects a truncated answer', () => {
  assert.equal(parseHelloResponse(Buffer.alloc(10), '1.2.3.4'), null);
});

test('parseCommandResponse reports device errors and bad checksums', () => {
  const response = Buffer.alloc(0x38);
  response.writeInt16LE(-7, 0x22);
  response.writeUInt16LE(checksum(response), 0x20);
  assert.throws(
    () => parseCommandResponse(response, INITIAL_KEY),
    (err) => err instanceof BroadlinkDeviceError && err.code === -7,
  );

  response.writeUInt16LE(0x1234, 0x20);
  assert.throws(() => parseCommandResponse(response, INITIAL_KEY), /checksum/);
});

test('packet counter keeps its high bit and wraps', () => {
  assert.equal(nextCount(0x8000), 0x8001);
  assert.equal(nextCount(0xffff), 0x8000);
});

test('MAC helpers', () => {
  assert.equal(normalizeMac('34:EA:34:AA:BB:CC'), MAC);
  assert.equal(formatMac(MAC), '34:ea:34:aa:bb:cc');
});
