// -----------------------------------------------------------------------------
// Learning of IR / RF codes on a universal remote.
//
// IR : enter learning mode, then poll the captured code while the user presses
//      the button of the original remote (pointed at the Broadlink).
// RF : 1) frequency sweep while the user HOLDS the button,
//      2) once the frequency is found, capture while the user presses it again.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  cancelSweep,
  checkData,
  checkFrequency,
  enterLearning,
  findRfPacket,
  sweepFrequency,
} from './broadlink/commands.js';
import { BroadlinkDeviceError } from './broadlink/protocol.js';

const logger = createLogger({ name: 'learning' });

export const LEARNING_DEFAULTS = {
  timeoutMs: 30_000,
  intervalMs: 1_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Poll `check` until it resolves a truthy value or the deadline passes.
 * A device error means "nothing captured yet" and is retried.
 */
async function pollUntil(check, { timeoutMs, intervalMs, sleep }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const result = await check();
      if (result) return result;
    } catch (err) {
      if (!(err instanceof BroadlinkDeviceError)) throw err;
    }
  }
  return null;
}

/**
 * @param {import('./broadlink/client.js').BroadlinkClient} client
 * @param {string} protocol
 * @returns {Promise<Buffer>}
 */
export async function learnIrCode(client, protocol, options = {}) {
  const opts = { ...LEARNING_DEFAULTS, ...options };
  await enterLearning(client, protocol);
  logger.info(`${client.mac}: IR learning mode, waiting for a code...`);
  const code = await pollUntil(async () => {
    const data = await checkData(client, protocol);
    return data.length > 0 ? Buffer.from(data) : null;
  }, opts);
  if (!code) {
    throw new Error('No IR code received: press the button closer to the Broadlink, then retry');
  }
  return code;
}

/**
 * @param {import('./broadlink/client.js').BroadlinkClient} client
 * @param {string} protocol
 * @returns {Promise<{ code: Buffer, frequency: number }>}
 */
export async function learnRfCode(client, protocol, options = {}) {
  const opts = { ...LEARNING_DEFAULTS, ...options };
  await sweepFrequency(client, protocol);
  logger.info(`${client.mac}: RF frequency sweep, hold the button...`);
  const sweep = await pollUntil(async () => {
    const result = await checkFrequency(client, protocol);
    return result.found ? result : null;
  }, opts);
  if (!sweep) {
    await cancelSweep(client, protocol).catch(() => {});
    throw new Error('RF frequency not found: hold the button of the remote during the scan');
  }

  logger.info(`${client.mac}: frequency ${sweep.frequency} MHz found, press the button again`);
  await findRfPacket(client, protocol, sweep.frequency);
  const code = await pollUntil(async () => {
    const data = await checkData(client, protocol);
    return data.length > 0 ? Buffer.from(data) : null;
  }, opts);
  if (!code) {
    throw new Error('No RF code received: release the button, then press it briefly once');
  }
  return { code, frequency: sweep.frequency };
}
