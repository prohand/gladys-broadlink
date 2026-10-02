// -----------------------------------------------------------------------------
// BroadlinkClient + commands against a fake device over real UDP (localhost).
// -----------------------------------------------------------------------------

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { BroadlinkClient } from '../src/broadlink/client.js';
import {
  getPlugState,
  getStripState,
  readA1Sensors,
  readRemoteSensors,
  sendCode,
  setPlugPower,
  setStripOutlet,
} from '../src/broadlink/commands.js';
import { PACKET_TYPES } from '../src/broadlink/protocol.js';
import { SESSION_ID, startFakeDevice } from './helpers/fakeBroadlinkDevice.js';

const devices = [];
after(() => Promise.all(devices.map((d) => d.close())));

async function setup(devtype, onCommand) {
  const fake = await startFakeDevice({ mac: '34ea34aabbcc', devtype, onCommand });
  devices.push(fake);
  const client = new BroadlinkClient({
    ip: '127.0.0.1',
    port: fake.port,
    mac: '34ea34aabbcc',
    devtype,
    timeout: 2000,
  });
  return { fake, client };
}

test('the client authenticates once, then uses the session id', async () => {
  const { fake, client } = await setup(0x5213);
  await client.send(PACKET_TYPES.COMMAND, Buffer.from([1]));
  await client.send(PACKET_TYPES.COMMAND, Buffer.from([2]));
  assert.equal(fake.authCount, 1);
  assert.equal(fake.received.length, 2);
  assert.ok(fake.received.every((r) => r.id === SESSION_ID));
});

test('an expired session is renegotiated transparently', async () => {
  const { fake, client } = await setup(0x5213);
  await client.send(PACKET_TYPES.COMMAND, Buffer.from([1]));
  fake.expireSession();
  await client.send(PACKET_TYPES.COMMAND, Buffer.from([2]));
  assert.equal(fake.authCount, 2);
});

test('an unreachable device rejects after the timeout', async () => {
  const client = new BroadlinkClient({
    ip: '127.0.0.1',
    port: 9, // discard: nothing answers
    mac: '34ea34aabbcc',
    devtype: 0x5213,
    timeout: 300,
  });
  await assert.rejects(() => client.send(PACKET_TYPES.COMMAND, Buffer.from([1])), /No answer/);
});

test('RM4: codes are sent with the length-prefixed framing', async () => {
  const { fake, client } = await setup(0x5213);
  const code = Buffer.from('26000c00010203040506070809', 'hex');
  await sendCode(client, 'rm4pro', code);
  const { payload } = fake.received.at(-1);
  assert.equal(payload.readUInt16LE(0), code.length + 4);
  assert.equal(payload.readUInt32LE(2), 0x02);
  assert.deepEqual(payload.subarray(6, 6 + code.length), code);
});

test('RM mini 3: codes are sent with the legacy framing', async () => {
  const { fake, client } = await setup(0x2737);
  const code = Buffer.from('26000400aabbccdd', 'hex');
  await sendCode(client, 'rmmini', code);
  const { payload } = fake.received.at(-1);
  assert.equal(payload.readUInt32LE(0), 0x02);
  assert.deepEqual(payload.subarray(4, 4 + code.length), code);
});

test('RM4: temperature and humidity are decoded', async () => {
  const { client } = await setup(0x5213, () => {
    // length (2) + 4 bytes of command echo, then 21.50 °C / 48.25 %
    const answer = Buffer.alloc(16);
    answer.writeUInt16LE(8, 0);
    answer.set([21, 50, 48, 25], 6);
    return answer;
  });
  assert.deepEqual(await readRemoteSensors(client, 'rm4pro'), {
    temperature: 21.5,
    humidity: 48.25,
  });
});

test('RM mini 3 has no sensor', async () => {
  const { client } = await setup(0x2737);
  assert.equal(await readRemoteSensors(client, 'rmmini'), null);
});

test('SP3S: relay state and BCD power are decoded', async () => {
  const { client } = await setup(0x947a, (type, payload) => {
    const answer = Buffer.alloc(16);
    if (payload[0] === 1) answer[4] = 1; // relay ON
    if (payload[0] === 8) answer.set([0x45, 0x23, 0x01], 5); // "012345" -> 123.45 W
    return answer;
  });
  assert.deepEqual(await getPlugState(client, 'sp3s'), { on: true, power: 123.45 });
});

test('SP2: set power sends the relay command', async () => {
  const { fake, client } = await setup(0x2720);
  await setPlugPower(client, 'sp2', true);
  const { payload } = fake.received.at(-1);
  assert.equal(payload[0], 2);
  assert.equal(payload[4], 1);
});

test('SP4: JSON state is decoded', async () => {
  const { client } = await setup(0x7579, () => {
    const json = Buffer.from('{"pwr":1,"ntlight":0}');
    const answer = Buffer.alloc(12);
    answer.writeUInt32LE(json.length, 8);
    return Buffer.concat([answer, json]);
  });
  assert.deepEqual(await getPlugState(client, 'sp4'), { on: true, power: null });
});

test('MP1: outlet mask is decoded and outlets are driven', async () => {
  const { fake, client } = await setup(0x4eb5, (type, payload) => {
    const answer = Buffer.alloc(16);
    if (payload[0] === 0x0a) answer[0x0e] = 0b0101;
    return answer;
  });
  assert.deepEqual(await getStripState(client), [true, false, true, false]);
  await setStripOutlet(client, 3, true);
  const { payload } = fake.received.at(-1);
  assert.equal(payload[0x0d], 0b0100);
  assert.equal(payload[0x0e], 0b0100);
});

test('A1: temperature and humidity are decoded', async () => {
  const { client } = await setup(0x2714, () => {
    const answer = Buffer.alloc(16);
    answer.set([19, 7, 55, 3], 4);
    return answer;
  });
  assert.deepEqual(await readA1Sensors(client), { temperature: 19.7, humidity: 55.3 });
});
