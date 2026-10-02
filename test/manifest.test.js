// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTIONS, BroadlinkIntegration, SCENE_ACTIONS } from '../src/integration.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { BROADLINK_PORT } from '../src/broadlink/protocol.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('every manifest action has a registered handler', () => {
  for (const action of manifest.actions ?? []) {
    const method = ACTIONS[action.key];
    assert.ok(method, `manifest action "${action.key}" has no handler`);
    assert.equal(typeof BroadlinkIntegration.prototype[method], 'function');
  }
  assert.equal(Object.keys(ACTIONS).length, manifest.actions.length, 'no orphan handler');
});

test('every scene action has a registered handler', () => {
  assert.ok(manifest.scene_actions.length > 0);
  for (const action of manifest.scene_actions) {
    const method = SCENE_ACTIONS[action.key];
    assert.ok(method, `scene action "${action.key}" has no handler`);
    assert.equal(typeof BroadlinkIntegration.prototype[method], 'function');
  }
});

test('scene actions require Gladys >= 5.1.0', () => {
  const [, major, minor] = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/).map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 1), manifest.gladys_version);
});

test('the mediated scan is declared on the Broadlink port', () => {
  const scan = manifest.network_discovery.find((d) => d.type === 'udp-active-broadcast');
  assert.ok(scan, 'udp-active-broadcast must be declared');
  assert.ok(scan.ports.includes(BROADLINK_PORT));
});

test('versions stay in lockstep', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  const [, major, minor] = minVersion.map(Number);
  assert.ok(
    major > 4 || (major === 4 && minor >= 86),
    `categories requires gladys_version >= 4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('section fields are purely presentational', () => {
  const sections = [
    ...manifest.config_schema,
    ...(manifest.actions ?? []).flatMap((a) => a.fields ?? []),
  ].filter((f) => f.type === 'section');
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined);
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(!(section.key in DEFAULT_CONFIG), `section "${section.key}" stores no value`);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const allFields = [
    ...manifest.config_schema,
    ...(manifest.actions ?? []).flatMap((a) => a.fields ?? []),
    ...(manifest.scene_actions ?? []).flatMap((a) => a.fields ?? []),
  ];
  for (const field of allFields.filter((f) => f.source !== undefined)) {
    assert.equal(field.source, 'devices', 'the only core-defined source in V1 is "devices"');
    assert.equal(field.options, undefined, `field "${field.key}": source and options together`);
  }
});

test('Broadlink is declared local-only', () => {
  assert.deepEqual(manifest.transports, ['local']);
});
