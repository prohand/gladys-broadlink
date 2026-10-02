import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseHosts, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), { ...DEFAULT_CONFIG, hostList: [] });
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ poll_frequency: '120' });
  assert.equal(config.poll_frequency, 120);
});

test('normalizeConfig keeps the polling frequency in bounds', () => {
  assert.equal(normalizeConfig({ poll_frequency: 1 }).poll_frequency, 10);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 60);
});

test('parseHosts splits, deduplicates and drops invalid addresses', () => {
  assert.deepEqual(parseHosts('192.168.1.50, 192.168.1.51;192.168.1.50  10.0.0.2'), [
    '192.168.1.50',
    '192.168.1.51',
    '10.0.0.2',
  ]);
  assert.deepEqual(parseHosts('my-rm.local, 300.1.1.1, '), []);
  assert.deepEqual(parseHosts(undefined), []);
});

test('normalizeConfig exposes the parsed host list', () => {
  assert.deepEqual(normalizeConfig({ hosts: '192.168.1.50' }).hostList, ['192.168.1.50']);
});
