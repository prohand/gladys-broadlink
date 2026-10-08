// -----------------------------------------------------------------------------
// Minimal UDP request/response helper.
//
// The integration container sits on a Docker bridge network: unicast UDP
// towards the LAN goes through the NAT and the answer comes back on the same
// socket, which is all a Broadlink command needs. Broadcast does NOT cross the
// bridge: LAN-wide discovery goes through the Gladys core (see discovery.js).
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';

/** Nothing came back from the device before the deadline. */
export class UdpTimeoutError extends Error {
  constructor(ip, port, timeout) {
    super(`No answer from ${ip}:${port} within ${timeout} ms`);
    this.name = 'UdpTimeoutError';
  }
}

/**
 * True when the device could not be reached at all: no answer in time, or the
 * socket itself failed (EHOSTUNREACH, ENETUNREACH... carry a `syscall`). A
 * device that answered garbage or an error code is NOT unreachable.
 */
export function isNoAnswerError(err) {
  return err instanceof UdpTimeoutError || typeof err?.syscall === 'string';
}

/**
 * Send `packet` to `ip:port` and resolve with the first answer received.
 * The packet is re-sent every `retryInterval` ms until `timeout` ms elapsed,
 * like the reference implementation (UDP may drop a datagram).
 *
 * `retransmit: false` sends the packet ONCE and only waits. Re-sending is only
 * safe for idempotent requests (reads, authentication): the device cannot tell
 * a retransmission from a new order, so a re-sent "emit this IR code" whose
 * answer was lost — or merely slow, a long RF code takes a while to emit —
 * fires the code twice, and a TV power toggle switches the TV on then off.
 *
 * @param {string} ip
 * @param {number} port
 * @param {Buffer} packet
 * @param {{ timeout?: number, retryInterval?: number, retransmit?: boolean }} [options]
 * @returns {Promise<Buffer>}
 */
export function udpRequest(
  ip,
  port,
  packet,
  { timeout = 5000, retryInterval = 1000, retransmit = true } = {},
) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let retryTimer;
    let timeoutTimer;
    let done = false;

    const finish = (err, response) => {
      if (done) return;
      done = true;
      clearInterval(retryTimer);
      clearTimeout(timeoutTimer);
      socket.close();
      if (err) reject(err);
      else resolve(response);
    };

    const send = () => {
      socket.send(packet, port, ip, (err) => {
        if (err) finish(err);
      });
    };

    socket.on('error', (err) => finish(err));
    socket.on('message', (message, rinfo) => {
      if (rinfo.address === ip) finish(null, message);
    });

    socket.bind(0, () => {
      send();
      if (retransmit) retryTimer = setInterval(send, retryInterval);
      timeoutTimer = setTimeout(() => finish(new UdpTimeoutError(ip, port, timeout)), timeout);
    });
  });
}
