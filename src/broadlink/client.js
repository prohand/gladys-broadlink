// -----------------------------------------------------------------------------
// Connection to ONE Broadlink device: authentication + encrypted commands.
//
// The session (id + AES key) is negotiated lazily on the first command and
// renegotiated transparently when the device says it expired (reboot, other
// client...). Commands to the same device are serialized: the firmware only
// handles one request at a time.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  BROADLINK_PORT,
  BroadlinkDeviceError,
  INITIAL_KEY,
  PACKET_TYPES,
  buildAuthPayload,
  buildCommandPacket,
  nextCount,
  parseAuthPayload,
  parseCommandResponse,
  randomCount,
} from './protocol.js';
import { udpRequest } from './udp.js';

const logger = createLogger({ name: 'broadlink-client' });

// Errors meaning "the session is no longer valid": authenticate again.
const SESSION_ERRORS = new Set([-1, -2, -7]);

export class BroadlinkClient {
  /**
   * @param {{ ip: string, mac: string, devtype: number, port?: number,
   *           timeout?: number, request?: typeof udpRequest }} options
   */
  constructor({ ip, mac, devtype, port = BROADLINK_PORT, timeout = 5000, request = udpRequest }) {
    this.ip = ip;
    this.port = port;
    this.mac = mac;
    this.devtype = devtype;
    this.timeout = timeout;
    this.request = request;
    this.count = randomCount();
    this.id = 0;
    this.key = INITIAL_KEY;
    this.authenticated = false;
    this.queue = Promise.resolve();
  }

  /** Run `task` after every previously queued command of this device. */
  serialize(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  /**
   * @param {number} packetType
   * @param {Buffer} payload
   * @param {{ retransmit?: boolean, timeout?: number }} [options] see udpRequest
   */
  async rawSend(packetType, payload, { retransmit = true, timeout = this.timeout } = {}) {
    this.count = nextCount(this.count);
    const packet = buildCommandPacket({
      devtype: this.devtype,
      packetType,
      count: this.count,
      mac: this.mac,
      id: this.id,
      key: this.key,
      payload,
    });
    const response = await this.request(this.ip, this.port, packet, { timeout, retransmit });
    return parseCommandResponse(response, this.key);
  }

  async authenticate() {
    this.id = 0;
    this.key = INITIAL_KEY;
    this.authenticated = false;
    const payload = await this.rawSend(PACKET_TYPES.AUTH, buildAuthPayload());
    const session = parseAuthPayload(payload);
    this.id = session.id;
    this.key = session.key;
    this.authenticated = true;
    logger.debug(`Authenticated with ${this.mac} (${this.ip})`);
  }

  /**
   * Send an encrypted command and resolve with the decrypted answer payload.
   * The authentication that may precede it is always retransmitted (it is
   * idempotent); `options` only apply to the command itself.
   * @param {number} packetType
   * @param {Buffer} payload
   * @param {{ retransmit?: boolean, timeout?: number }} [options] see udpRequest
   */
  send(packetType, payload, options) {
    return this.serialize(async () => {
      if (!this.authenticated) {
        await this.authenticate();
      }
      try {
        return await this.rawSend(packetType, payload, options);
      } catch (err) {
        // The device refused the command (it was NOT executed): sending it again
        // on a fresh session is safe, even for a one-shot order.
        if (err instanceof BroadlinkDeviceError && SESSION_ERRORS.has(err.code)) {
          logger.info(`Session expired on ${this.mac}, authenticating again`);
          await this.authenticate();
          return this.rawSend(packetType, payload, options);
        }
        if (!(err instanceof BroadlinkDeviceError)) {
          // Network error: the device may have rebooted, renegotiate next time.
          this.authenticated = false;
        }
        throw err;
      }
    });
  }
}
