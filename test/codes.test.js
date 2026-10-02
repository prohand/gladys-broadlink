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
