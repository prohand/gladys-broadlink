// -----------------------------------------------------------------------------
// Minimal UDP request/response helper.
//
// The integration container sits on a Docker bridge network: unicast UDP
// towards the LAN goes through the NAT and the answer comes back on the same
// socket, which is all a Broadlink command needs. Broadcast does NOT cross the
// bridge: LAN-wide discovery goes through the Gladys core (see discovery.js).
// -----------------------------------------------------------------------------

import dgram from 'node:dgram';

/**
 * Send `packet` to `ip:port` and resolve with the first answer received.
 * The packet is re-sent every `retryInterval` ms until `timeout` ms elapsed,
 * like the reference implementation (UDP may drop a datagram).
 *
 * @param {string} ip
 * @param {number} port
 * @param {Buffer} packet
 * @param {{ timeout?: number, retryInterval?: number }} [options]
 * @returns {Promise<Buffer>}
 */
export function udpRequest(ip, port, packet, { timeout = 5000, retryInterval = 1000 } = {}) {
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
      retryTimer = setInterval(send, retryInterval);
      timeoutTimer = setTimeout(
        () => finish(new Error(`No answer from ${ip}:${port} within ${timeout} ms`)),
        timeout,
      );
    });
  });
}
