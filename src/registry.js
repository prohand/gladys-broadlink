// -----------------------------------------------------------------------------
// In-memory registry of the known Broadlink devices.
//
// A device becomes known either from a discovery scan, or from the params of a
// device already created in Gladys (so the integration can drive it right
// after a restart, before any scan). The registry also keeps one
// BroadlinkClient per device, so the authenticated session is reused.
// -----------------------------------------------------------------------------

import { BroadlinkClient } from './broadlink/client.js';
import { formatDevtype, getModel } from './broadlink/models.js';
import { normalizeMac } from './broadlink/protocol.js';

// Names of the params stored on the Gladys device.
export const PARAMS = {
  IP_ADDRESS: 'IP_ADDRESS',
  MAC: 'MAC',
  DEVTYPE: 'DEVTYPE',
  CAPABILITIES: 'CAPABILITIES',
};

/**
 * @typedef {object} DeviceInfo
 * @property {string} ip
 * @property {string} mac          12 lowercase hex chars
 * @property {number} devtype
 * @property {string} name         name set in the Broadlink app (may be empty)
 * @property {boolean} locked
 * @property {string} model
 * @property {string} protocol     see broadlink/models.js
 * @property {string} kind         'remote' | 'plug' | 'strip' | 'sensor'
 * @property {string[]} capabilities optional features detected on the device
 */

export class DeviceRegistry {
  /** @param {{ createClient?: (info: DeviceInfo) => BroadlinkClient }} [options] */
  constructor({ createClient = (info) => new BroadlinkClient(info) } = {}) {
    this.devices = new Map(); // mac -> DeviceInfo
    this.clients = new Map(); // mac -> BroadlinkClient
    this.createClient = createClient;
  }

  /**
   * Add or refresh a device. Unsupported products are ignored (returns null).
   * Known capabilities are kept unless new ones are given.
   * @param {{ ip: string, mac: string, devtype: number, name?: string,
   *           locked?: boolean, capabilities?: string[] }} found
   * @returns {DeviceInfo | null}
   */
  upsert(found) {
    const model = getModel(found.devtype);
    if (!model) return null;
    const mac = normalizeMac(found.mac);
    const previous = this.devices.get(mac);
    const info = {
      ip: found.ip,
      mac,
      devtype: Number(found.devtype),
      name: found.name || previous?.name || '',
      locked: Boolean(found.locked ?? previous?.locked),
      model: model.model,
      protocol: model.protocol,
      kind: model.kind,
      capabilities: found.capabilities ?? previous?.capabilities ?? [],
    };
    this.devices.set(mac, info);

    const client = this.clients.get(mac);
    if (client && client.ip !== info.ip) {
      // DHCP gave the device a new address: start a fresh session.
      this.clients.delete(mac);
    }
    return info;
  }

  setCapabilities(mac, capabilities) {
    const info = this.devices.get(normalizeMac(mac));
    if (info) info.capabilities = [...capabilities];
  }

  /**
   * Rebuild the registry entry of a device created in Gladys, from its params.
   * @param {{ params?: Array<{ name: string, value: string }> }} gladysDevice
   */
  upsertFromGladysDevice(gladysDevice) {
    const params = Object.fromEntries((gladysDevice.params ?? []).map((p) => [p.name, p.value]));
    if (!params[PARAMS.MAC] || !params[PARAMS.IP_ADDRESS] || !params[PARAMS.DEVTYPE]) {
      return null;
    }
    const known = this.devices.get(normalizeMac(params[PARAMS.MAC]));
    return this.upsert({
      ip: known?.ip ?? params[PARAMS.IP_ADDRESS],
      mac: params[PARAMS.MAC],
      devtype: Number.parseInt(params[PARAMS.DEVTYPE], 16),
      capabilities:
        known?.capabilities ??
        String(params[PARAMS.CAPABILITIES] ?? '')
          .split(',')
          .filter(Boolean),
    });
  }

  /** @returns {DeviceInfo[]} */
  all() {
    return [...this.devices.values()];
  }

  /**
   * Find the device behind a Gladys device external_id.
   * Falls back on the params of the Gladys device when it is not known yet.
   */
  findByGladysDevice(gladys, gladysDevice) {
    const found = this.all().find(
      (info) => gladys.externalIds(info.kind, info.mac).device === gladysDevice.external_id,
    );
    return found ?? this.upsertFromGladysDevice(gladysDevice) ?? undefined;
  }

  /** @param {DeviceInfo} info */
  getClient(info) {
    let client = this.clients.get(info.mac);
    if (!client) {
      client = this.createClient(info);
      this.clients.set(info.mac, client);
    }
    return client;
  }
}

/** Params stored on the Gladys device, to reach it again after a restart. */
export function buildParams(info) {
  return [
    { name: PARAMS.IP_ADDRESS, value: info.ip },
    { name: PARAMS.MAC, value: info.mac },
    { name: PARAMS.DEVTYPE, value: formatDevtype(info.devtype) },
    { name: PARAMS.CAPABILITIES, value: info.capabilities.join(',') },
  ];
}
