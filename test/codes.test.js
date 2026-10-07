import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodeStore, parseCode, slugify } from '../src/codes.js';

const MAC = '34ea34aabbcc';

test('slugify builds stable keys', () => {
  assert.equal(slugify('TV - On / Off'), 'tv-on-off');
  assert.equal(slugify('Télé Salon'), 'tele-salon');
  assert.equal(slugify('  !!  '), '');
});

test('parseCode accepts hexadecimal and base64', () => {
  const bytes = Buffer.from('26000c00aabbccdd', 'hex');
  assert.deepEqual(parseCode('26000c00aabbccdd'), bytes);
  assert.deepEqual(parseCode('2600 0c00 aabb ccdd'), bytes);
  assert.deepEqual(parseCode(bytes.toString('base64')), bytes);
});

test('parseCode rejects garbage', () => {
  assert.throws(() => parseCode(''), /empty/);
  assert.throws(() => parseCode('not a code!'), /hexadecimal or base64/);
  assert.throws(() => parseCode('2600'), /too short/);
});

test('the store persists codes per device and refuses duplicates', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'broadlink-codes-'));
  const store = await new CodeStore(dir).load();
  await store.add(MAC, 'TV on', Buffer.from('26000400aabbccdd', 'hex'));
  await assert.rejects(() => store.add(MAC, 'tv ON', Buffer.from('2600', 'hex')), /already exists/);

  const reloaded = await new CodeStore(dir).load();
  const [entry] = reloaded.list(MAC);
  assert.equal(entry.key, 'tv-on');
  assert.equal(entry.name, 'TV on');
  assert.deepEqual(entry.code, Buffer.from('26000400aabbccdd', 'hex'));
  assert.ok(reloaded.get(MAC, 'TV ON'), 'lookup by name is case-insensitive');
  assert.deepEqual(reloaded.list('aabbccddeeff'), [], 'codes are per device');

  assert.equal(await reloaded.remove(MAC, 'TV on'), true);
  assert.equal(await reloaded.remove(MAC, 'TV on'), false);
  const file = JSON.parse(await readFile(path.join(dir, 'codes.json'), 'utf8'));
  assert.deepEqual(file[MAC], {});
});

test('names that only differ by a symbol get their own key', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'broadlink-codes-'));
  const store = new CodeStore(dir);
  const up = Buffer.from('26000c00aabbccdd', 'hex');
  const down = Buffer.from('26000c0011223344', 'hex');

  assert.equal((await store.add(MAC, 'Vol+', up)).key, 'vol');
  assert.equal((await store.add(MAC, 'Vol-', down)).key, 'vol-2');
  await assert.rejects(store.add(MAC, 'vol-', down), /already exists/);

  // Looked up by name first: each one sends its own code.
  assert.deepEqual(store.get(MAC, 'Vol+').code, up);
  assert.deepEqual(store.get(MAC, 'VOL-').code, down);
  // A key still works where no name matches, as before.
  assert.deepEqual(store.get(MAC, 'vol').code, up);

  assert.equal(await store.remove(MAC, 'Vol-'), true);
  // Gone means gone: never the other code that shares its slug.
  assert.equal(store.get(MAC, 'Vol-'), undefined);
  assert.equal(await store.remove(MAC, 'Vol-'), false);
  assert.equal(store.list(MAC).length, 1);
});
