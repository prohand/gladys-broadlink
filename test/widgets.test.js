// -----------------------------------------------------------------------------
// The "Broadlink remote" dashboard widget: content within the core budget,
// buttons that send the codes, and the form for the other codes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { CodeStore } from '../src/codes.js';
import { BroadlinkIntegration } from '../src/integration.js';
import { DeviceRegistry } from '../src/registry.js';
import { buildRemoteWidget, pickButtonCodes, WIDGET_ACTIONS } from '../src/widgets.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const RM_MAC = '34ea34000001';
const CODE = Buffer.from('2600100001020304050607080910111213140d05', 'hex');

async function setup({ capabilities = ['temperature', 'humidity'], codes = [] } = {}) {
  const gladys = createFakeGladys();
  const sent = [];
  const registry = new DeviceRegistry({
    createClient: () => ({
      // sendCode goes through the client: record what reaches it.
      async command(...args) {
        sent.push(args);
        return Buffer.alloc(16);
      },
    }),
  });
  registry.upsert({ ip: '127.0.0.1', mac: RM_MAC, devtype: 0x5213, name: 'Salon' });
  registry.setCapabilities(RM_MAC, capabilities);
  const store = await new CodeStore(await mkdtemp(path.join(tmpdir(), 'broadlink-widget-'))).load();
  for (const name of codes) await store.add(RM_MAC, name, CODE);
  const integration = new BroadlinkIntegration(gladys, { registry, codes: store });
  const remote = gladys.externalIds('remote', RM_MAC).device;
  return { gladys, integration, remote, sent, store };
}

const buttons = (content) => content.components.filter((c) => c.type === 'button');

test('every content stays within the core vocabulary and budget', async () => {
  for (const codes of [[], ['TV on'], ['A', 'B', 'C', 'D', 'E']]) {
    for (const capabilities of [[], ['temperature'], ['temperature', 'humidity']]) {
      const { integration, remote } = await setup({ codes, capabilities });
      const content = integration.remoteWidget({ settings: { remote } });
      assert.deepEqual(validateWidgetContent(content), [], JSON.stringify(content));
    }
  }
  const { integration } = await setup();
  const unknown = integration.remoteWidget({ settings: { remote: 'ext:broadlink:remote:nope' } });
  assert.deepEqual(validateWidgetContent(unknown), []);
  assert.equal(unknown.components[0].type, 'text');
});

test('the sensor tiles are bound to the remote features', async () => {
  const { gladys, integration, remote } = await setup({ codes: ['TV on'] });
  const tiles = integration
    .remoteWidget({ settings: { remote } })
    .components.filter((c) => c.type === 'value');
  const ids = gladys.externalIds('remote', RM_MAC);
  assert.deepEqual(
    tiles.map((t) => t.device_feature),
    [ids.feature('temperature'), ids.feature('humidity')],
  );
});

test('three code buttons, then a form with the other codes', async () => {
  const { integration, remote } = await setup({ codes: ['A', 'B', 'C', 'D', 'E'] });
  const content = integration.remoteWidget({ settings: { remote } });
  const [a, b, c, more] = buttons(content);
  assert.deepEqual(
    [a, b, c].map((button) => button.action.params.code),
    ['A', 'B', 'C'],
  );
  assert.equal(more.action.key, WIDGET_ACTIONS.MORE);
  assert.deepEqual(
    more.action.fields[0].options.map((o) => o.value),
    ['D', 'E'],
  );
  const keys = buttons(content).map((button) => button.action.key);
  assert.equal(new Set(keys).size, keys.length, 'action keys are unique within the content');
});

test('the codes setting picks the buttons, unknown names skipped', () => {
  const codes = [{ name: 'TV on' }, { name: 'Vol+' }, { name: 'Vol-' }, { name: 'Mute' }];
  assert.deepEqual(
    pickButtonCodes(codes, 'mute, nope, TV ON').map((c) => c.name),
    ['Mute', 'TV on'],
  );
  assert.deepEqual(
    pickButtonCodes(codes, '').map((c) => c.name),
    ['TV on', 'Vol+', 'Vol-'],
  );
});

test('no form when every code already has its button', async () => {
  const { integration, remote } = await setup({ codes: ['A', 'B'] });
  const content = integration.remoteWidget({ settings: { remote } });
  assert.equal(buttons(content).length, 2);
});

test('a remote without code says how to add one', () => {
  const gladys = createFakeGladys();
  const content = buildRemoteWidget(
    gladys,
    { kind: 'remote', mac: RM_MAC, capabilities: [] },
    [],
    {},
  );
  assert.equal(buttons(content).length, 0);
  assert.match(content.components.at(-1).text.en, /learn or import/);
});

test('a tap sends the code, the form sends it the chosen number of times', async () => {
  const { integration, remote } = await setup({ codes: ['TV on', 'Mute'] });
  const sends = [];
  integration.sendCode = async (fields) => {
    sends.push(fields);
    return { en: 'sent' };
  };
  await integration.remoteWidgetAction(
    `${WIDGET_ACTIONS.CODE_PREFIX}1`,
    { code: 'TV on' },
    { settings: { remote } },
  );
  await integration.remoteWidgetAction(
    WIDGET_ACTIONS.MORE,
    {},
    { settings: { remote }, values: { code: 'Mute', repeat: 3 } },
  );
  assert.deepEqual(sends, [
    { device: remote, name: 'TV on', repeat: 1 },
    { device: remote, name: 'Mute', repeat: 3 },
  ]);
  await assert.rejects(() => integration.remoteWidgetAction('other', {}, { settings: { remote } }));
  await assert.rejects(
    () => integration.remoteWidgetAction(WIDGET_ACTIONS.MORE, {}, { settings: { remote } }),
    /No code chosen/,
  );
});

test('learning, importing or deleting a code nudges the widget', async () => {
  const { gladys, integration, remote } = await setup();
  await integration.importCode({ device: remote, name: 'TV on', code: CODE.toString('hex') });
  await integration.deleteCode({ device: remote, name: 'TV on' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(gladys.widgetRefreshes, ['remote', 'remote']);
});
