// -----------------------------------------------------------------------------
// udpRequest: retransmissions for idempotent requests, a single send for the
// orders a device must not execute twice.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import { isNoAnswerError, udpRequest, UdpTimeoutError } from '../src/broadlink/udp.js';

/** A UDP listener that counts what it receives and never answers. */
async function startSilentDevice() {
  const socket = dgram.createSocket('udp4');
  let received = 0;
  socket.on('message', () => {
    received += 1;
  });
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  return {
    port: socket.address().port,
    get received() {
      return received;
    },
    close: () => new Promise((resolve) => socket.close(resolve)),
  };
}

test('a request is re-sent until it is answered, by default', async (t) => {
  const device = await startSilentDevice();
  t.after(() => device.close());
  await assert.rejects(
    udpRequest('127.0.0.1', device.port, Buffer.from([1]), { timeout: 350, retryInterval: 100 }),
    UdpTimeoutError,
  );
  assert.ok(device.received >= 3, `${device.received} transmissions`);
});

test('retransmit: false sends the packet exactly once', async (t) => {
  const device = await startSilentDevice();
  t.after(() => device.close());
  const error = await udpRequest('127.0.0.1', device.port, Buffer.from([1]), {
    timeout: 350,
    retryInterval: 100,
    retransmit: false,
  }).catch((err) => err);
  assert.ok(isNoAnswerError(error));
  assert.equal(device.received, 1);
});

test('only a missing answer or a socket failure counts as "no answer"', () => {
  assert.equal(isNoAnswerError(new UdpTimeoutError('127.0.0.1', 80, 10)), true);
  const socketError = Object.assign(new Error('send EHOSTUNREACH'), { syscall: 'send' });
  assert.equal(isNoAnswerError(socketError), true);
  assert.equal(isNoAnswerError(new Error('Broadlink response checksum mismatch')), false);
});
