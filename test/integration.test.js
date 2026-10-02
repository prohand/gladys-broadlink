// -----------------------------------------------------------------------------
// End-to-end behaviour of the integration: scan -> publish -> commands, with a
// fake Gladys and fake Broadlink devices on localhost.
// -----------------------------------------------------------------------------

import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEVICE_FEATURE_CATEGORIES } from '@gladysassistant/integration-sdk';
import { BroadlinkClient } from '../src/broadlink/client.js';
import { CodeStore } from '../src/codes.js';
import { discoverDevices } from '../src/discovery.js';
import { BroadlinkIntegration } from '../src/integration.js';
import { DeviceRegistry } from '../src/registry.js';
import { buildHelloAnswer, startFakeDevice } from './helpers/fakeBroadlinkDevice.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const RM_MAC = '34ea34000001';
const PLUG_MAC = '34ea34000002';
const LEARNED = Buffer.from('2600100001020304050607080910111213140d05', 'hex');

let rm;
let plug;
let plugOn = false;

before(async () => {
  let learningPolls = 0;
  rm = await startFakeDevice({
    mac: RM_MAC,
    devtype: 0x5213, // RM4 pro
    name: 'Salon',
    onCommand(type, payload) {
      const command = payload.readUInt32LE(2);
      const answer = Buffer.alloc(32);
      if (command === 0x24) {
        answer.writeUInt16LE(8, 0);
        answer.set([22, 0, 40, 0], 6);
      } else if (command === 0x04) {
        // Nothing captured on the first poll, then the learned code.
        learningPolls += 1;
        if (learningPolls === 1) return { error: -10 };
        answer.writeUInt16LE(4 + LEARNED.length, 0);
        LEARNED.copy(answer, 6);
      } else {
        answer.writeUInt16LE(4, 0);
      }
      return answer;
    },
  });
  plug = await startFakeDevice({
    mac: PLUG_MAC,
    devtype: 0x947a, // SP3S-EU
    onCommand(type, payload) {
      const answer = Buffer.alloc(16);
      if (payload[0] === 2) plugOn = payload[4] === 1;
      if (payload[0] === 1) answer[4] = plugOn ? 1 : 0;
      if (payload[0] === 8) answer.set([0x00, 0x50, 0x00], 5); // "005000" -> 50 W
      return answer;
    },
  });
});

after(() => Promise.all([rm.close(), plug.close()]));

async function createIntegration(gladysOptions = {}) {
  const gladys = createFakeGladys({
    scanReplies: [
      {
        source_ip: '127.0.0.1',
        source_port: 80,
        payload_base64: buildHelloAnswer({ mac: RM_MAC, devtype: 0x5213, name: 'Salon' }).toString(
          'base64',
        ),
      },
      {
        source_ip: '127.0.0.1',
        source_port: 80,
        payload_base64: buildHelloAnswer({ mac: PLUG_MAC, devtype: 0x947a }).toString('base64'),
      },
    ],
    ...gladysOptions,
  });
  // The fake devices listen on random ports: route each MAC to its port.
  const ports = { [RM_MAC]: rm.port, [PLUG_MAC]: plug.port };
  const registry = new DeviceRegistry({
    createClient: (info) => new BroadlinkClient({ ...info, port: ports[info.mac], timeout: 1500 }),
  });
  const codes = await new CodeStore(await mkdtemp(path.join(tmpdir(), 'broadlink-it-'))).load();
  const integration = new BroadlinkIntegration(gladys, {
    registry,
    codes,
    learning: { intervalMs: 10, timeoutMs: 2000 },
  });
  return { gladys, integration };
}

test('scan publishes the supported devices with their detected features', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();

  assert.equal(gladys.scans[0].type, 'udp-active-broadcast');
  assert.equal(gladys.scans[0].options.port, 80);
  assert.equal(gladys.scans[0].options.payload.length, 0x30);

  const devices = gladys.lastDiscovered;
  assert.equal(devices.length, 2);

  const remote = devices.find((d) => d.external_id.includes(RM_MAC));
  assert.equal(remote.name, 'Salon');
  assert.deepEqual(
    remote.features.map((f) => f.category),
    [DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR, DEVICE_FEATURE_CATEGORIES.HUMIDITY_SENSOR],
  );
  assert.ok(remote.poll_frequency > 0);
  assert.ok(remote.params.some((p) => p.name === 'DEVTYPE' && p.value === '0x5213'));

  const smartPlug = devices.find((d) => d.external_id.includes(PLUG_MAC));
  assert.equal(smartPlug.name, 'Broadlink SP3S-EU');
  assert.deepEqual(
    smartPlug.features.map((f) => f.category),
    [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR],
  );
});

test('every published feature uses a known category and type', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  await integration.importCode({
    device: gladys.externalIds('remote', RM_MAC).device,
    name: 'TV on',
    code: LEARNED.toString('base64'),
  });
  for (const device of gladys.lastDiscovered) {
    for (const feature of device.features) {
      assert.ok(feature.category, `${feature.external_id}: category`);
      assert.ok(feature.type, `${feature.external_id}: type`);
    }
  }
});

test('a broadcast scan failure still probes the manual addresses', async () => {
  const { gladys, integration } = await createIntegration({ scanError: new Error('429') });
  const found = await discoverDevices(
    gladys,
    { hostList: ['127.0.0.1'] },
    {
      request: () => Promise.resolve(buildHelloAnswer({ mac: PLUG_MAC, devtype: 0x947a })),
    },
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].mac, PLUG_MAC);
  assert.ok(integration);
});

test('the plug is switched and polled', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  const device = gladys.lastDiscovered.find((d) => d.external_id.includes(PLUG_MAC));
  const onOff = device.features[0];

  await integration.onSetValue(device, onOff, 1);
  assert.deepEqual(gladys.published.at(-1), { featureExternalId: onOff.external_id, state: 1 });

  await integration.onPoll(device);
  assert.deepEqual(gladys.published.slice(-2), [
    { featureExternalId: onOff.external_id, state: 1 },
    { featureExternalId: device.features[1].external_id, state: 50 },
  ]);
});

test('a created device is drivable from its params, before any scan', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  const device = gladys.lastDiscovered.find((d) => d.external_id.includes(PLUG_MAC));

  const { gladys: fresh, integration: restarted } = await createIntegration();
  await restarted.onPoll({ external_id: device.external_id, params: device.params });
  assert.equal(fresh.published.length, 2);
});

test('learning an IR code adds a button feature that sends it', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  const remoteId = gladys.externalIds('remote', RM_MAC).device;

  const message = await integration.learnCode({ device: remoteId, name: 'TV on', signal: 'ir' });
  assert.match(message.en, /TV on/);
  assert.match(message.fr, /Découverte/);

  const remote = gladys.lastDiscovered.find((d) => d.external_id === remoteId);
  const button = remote.features.find((f) => f.name === 'TV on');
  assert.ok(button, 'the learned code becomes a feature');
  assert.equal(button.category, DEVICE_FEATURE_CATEGORIES.SWITCH);

  await integration.onSetValue(remote, button, 1);
  const sent = rm.received.at(-1).payload;
  assert.equal(sent.readUInt32LE(2), 0x02, 'send command');
  assert.deepEqual(sent.subarray(6, 6 + LEARNED.length), LEARNED);
  assert.deepEqual(gladys.published.at(-1), { featureExternalId: button.external_id, state: 0 });
});

test('codes can be imported, listed, sent and deleted through the actions', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  const device = gladys.externalIds('remote', RM_MAC).device;

  await integration.importCode({ device, name: 'Clim 21°C', code: LEARNED.toString('hex') });
  assert.match(integration.listCodes({ device }).fr, /Clim 21°C/);

  const before = rm.received.length;
  await integration.sendCode({ device, name: 'clim 21°c', repeat: 2 });
  assert.equal(rm.received.length - before, 2, 'sent twice');

  await integration.deleteCode({ device, name: 'Clim 21°C' });
  assert.match(integration.listCodes({ device }).en, /No code/);
  await assert.rejects(() => integration.sendCode({ device, name: 'Clim 21°C' }), /No code/);
});

test('code actions refuse a device that is not a remote', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  const device = gladys.externalIds('plug', PLUG_MAC).device;
  await assert.rejects(
    () => integration.importCode({ device, name: 'x', code: LEARNED.toString('hex') }),
    /not a universal remote/,
  );
});

test('RF learning is refused on a remote without radio', async () => {
  const { integration, gladys } = await createIntegration();
  integration.registry.upsert({ ip: '127.0.0.1', mac: 'aabbccddeeff', devtype: 0x2737 });
  await assert.rejects(
    () =>
      integration.learnCode({
        device: gladys.externalIds('remote', 'aabbccddeeff').device,
        name: 'Portail',
        signal: 'rf',
      }),
    /cannot learn radio/,
  );
});

test('locked or unsupported devices are not published', async () => {
  const { gladys, integration } = await createIntegration({
    scanReplies: [
      {
        source_ip: '127.0.0.1',
        payload_base64: buildHelloAnswer({
          mac: '000000000001',
          devtype: 0x2737,
          locked: true,
        }).toString('base64'),
      },
      {
        source_ip: '127.0.0.1',
        payload_base64: buildHelloAnswer({ mac: '000000000002', devtype: 0x4e2a }).toString(
          'base64',
        ),
      },
    ],
  });
  await integration.scan();
  assert.deepEqual(gladys.lastDiscovered, []);
  assert.match(integration.listDevices().en, /locked/);
});

test('the scan marks the answering devices as local', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  assert.deepEqual(
    gladys.transports.map((t) => t.transport),
    ['local', 'local'],
  );
  assert.ok(gladys.transports.every((t) => t.external_id.startsWith('ext:broadlink:')));
});

test('a device that stops answering is marked unreachable, then local again', async () => {
  const { gladys, integration } = await createIntegration();
  await integration.scan();
  const device = gladys.lastDiscovered.find((d) => d.external_id.includes(PLUG_MAC));
  const info = integration.registry.findByGladysDevice(gladys, device);
  const client = integration.registry.getClient(info);
  const realPort = client.port;

  client.port = 9; // nothing answers there
  client.timeout = 300;
  await assert.rejects(() => integration.onPoll(device), /No answer/);
  assert.deepEqual(gladys.transports.at(-1), {
    external_id: device.external_id,
    transport: 'unreachable',
  });

  client.port = realPort;
  await integration.onPoll(device);
  assert.equal(gladys.transports.at(-1).transport, 'local');

  const count = gladys.transports.length;
  await integration.onPoll(device);
  assert.equal(gladys.transports.length, count, 'no badge update when nothing changed');
});
