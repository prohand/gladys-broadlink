// -----------------------------------------------------------------------------
// Discovery of the Broadlink devices on the LAN.
//
// Broadlink discovery is query/response: a "hello" packet is broadcast on UDP
// port 80 and every device answers in unicast to the sender. A broadcast never
// leaves the Docker bridge of the integration container, so two paths are
// combined:
//   1. mediated scan: the Gladys core (host network) broadcasts the hello
//      packet we forge and relays the answers (manifest `network_discovery`,
//      type `udp-active-broadcast`);
//   2. direct unicast hello to the IP addresses typed in the configuration,
//      for networks where the broadcast does not reach the devices (VLANs...).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { BROADLINK_PORT, buildHelloPacket, parseHelloResponse } from './broadlink/protocol.js';
import { udpRequest } from './broadlink/udp.js';

const logger = createLogger({ name: 'discovery' });

export const SCAN_TIMEOUT_SECONDS = 5;

/**
 * @param {object} gladys SDK instance
 * @param {{ hostList: string[] }} config
 * @param {{ request?: typeof udpRequest }} [deps]
 * @returns {Promise<Array<ReturnType<typeof parseHelloResponse>>>} one entry per device
 */
export async function discoverDevices(gladys, config, { request = udpRequest } = {}) {
  const hello = buildHelloPacket();
  const found = [];

  // 1. Mediated broadcast scan through the Gladys core.
  try {
    const replies = await gladys.scanNetwork('udp-active-broadcast', {
      port: BROADLINK_PORT,
      payload: hello,
      timeoutSeconds: SCAN_TIMEOUT_SECONDS,
    });
    for (const reply of replies ?? []) {
      const info = parseHelloResponse(Buffer.from(reply.payload_base64, 'base64'), reply.source_ip);
      if (info) found.push(info);
    }
    logger.info(`Broadcast scan: ${found.length} answer(s)`);
  } catch (err) {
    // 429 (one scan per 10 s), a Gladys without mediated discovery...: the
    // manual addresses below still work.
    logger.warn(`Broadcast scan failed: ${err.message}`);
  }

  // 2. Direct hello to the addresses typed by the user.
  const manual = await Promise.allSettled(
    config.hostList.map(async (ip) => {
      const response = await request(ip, BROADLINK_PORT, hello, { timeout: 3000 });
      return parseHelloResponse(response, ip);
    }),
  );
  manual.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      found.push(result.value);
    } else {
      const reason = result.reason?.message ?? 'invalid answer';
      logger.warn(`No Broadlink device at ${config.hostList[index]}: ${reason}`);
    }
  });

  // The same device may answer both ways: keep one entry per MAC.
  const byMac = new Map();
  for (const info of found) byMac.set(info.mac, info);
  return [...byMac.values()];
}
