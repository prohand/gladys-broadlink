// -----------------------------------------------------------------------------
// Device catalog.
//
// Unlike a static integration, the devices are only known at runtime (from a
// network scan). Each Broadlink product family maps to one blueprint, keyed by
// the `kind` declared in broadlink/models.js. A blueprint exposes:
//   - kind                                  : short identifier (external ids, logs)
//   - probe(client, info)                   : detect optional features, resolves
//                                             a list of capabilities
//   - buildFeatures(gladys, info, ctx)      : { features, pollFrequency }
//   - onSetValue(gladys, {...}) (optional)  : run a user command
//   - onPoll(gladys, {...})     (optional)  : periodic read
// -----------------------------------------------------------------------------

import { gladysPollFrequency } from '../config.js';
import { buildParams } from '../registry.js';
import { plug } from './plug.js';
import { remote } from './remote.js';
import { sensor } from './sensor.js';
import { strip } from './strip.js';

export const BLUEPRINTS = Object.fromEntries(
  [remote, plug, strip, sensor].map((bp) => [bp.kind, bp]),
);

/** @param {import('../registry.js').DeviceInfo} info */
export function getBlueprint(info) {
  return BLUEPRINTS[info.kind];
}

/** Gladys device name: the name given in the Broadlink app, or the model. */
export function deviceName(info) {
  return info.name || `Broadlink ${info.model}`;
}

/**
 * Build the discovery payload of one device.
 * @param {object} gladys
 * @param {import('../registry.js').DeviceInfo} info
 * @param {{ config: object, codes: import('../codes.js').CodeStore }} ctx
 */
export function buildDevice(gladys, info, ctx) {
  const blueprint = getBlueprint(info);
  const { features, pollFrequency } = blueprint.buildFeatures(gladys, info, ctx);
  const device = {
    name: deviceName(info),
    external_id: gladys.externalIds(info.kind, info.mac).device,
    params: buildParams(info),
    features,
  };
  if (pollFrequency) {
    // `pollFrequency` is the configured interval in seconds: Gladys wants one of
    // its own ticks, in milliseconds, and only polls a device that also asks
    // for it with `should_poll` (false by default in the core).
    device.should_poll = true;
    device.poll_frequency = gladysPollFrequency(pollFrequency);
  }
  return device;
}

/**
 * Build the discovery payload of every known device. Locked devices (locked
 * in the Broadlink app) refuse any local command, so they are left out.
 */
export function buildDiscoveredDevices(gladys, registry, ctx) {
  return registry
    .all()
    .filter((info) => !info.locked)
    .map((info) => buildDevice(gladys, info, ctx));
}
