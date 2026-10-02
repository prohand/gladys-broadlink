// -----------------------------------------------------------------------------
// Broadlink integration logic, independent from the SDK wiring (index.js) so
// it can be unit-tested with a fake Gladys object and fake device clients.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { sendCode } from './broadlink/commands.js';
import { RF_PROTOCOLS } from './broadlink/models.js';
import { BroadlinkDeviceError, formatMac } from './broadlink/protocol.js';
import { CodeStore, parseCode } from './codes.js';
import { normalizeConfig } from './config.js';
import { buildDiscoveredDevices, deviceName, getBlueprint } from './devices/index.js';
import { discoverDevices } from './discovery.js';
import { learnIrCode, learnRfCode } from './learning.js';
import { DeviceRegistry } from './registry.js';

const logger = createLogger({ name: 'broadlink' });

// Manifest `actions` key -> BroadlinkIntegration method (see index.js).
export const ACTIONS = {
  list_devices: 'listDevices',
  learn_code: 'learnCode',
  import_code: 'importCode',
  send_code: 'sendCode',
  list_codes: 'listCodes',
  delete_code: 'deleteCode',
};

// Manifest `scene_actions` key -> BroadlinkIntegration method (Gladys >= 5.1).
export const SCENE_ACTIONS = {
  send_code: 'sendCode',
};

const DISCOVERY_HINT = {
  en: 'Open the Discovery tab to add or update the device.',
  fr: "Ouvrez l'onglet Découverte pour ajouter ou mettre à jour l'appareil.",
};

export class BroadlinkIntegration {
  /**
   * @param {object} gladys SDK instance (or a fake one in tests)
   * @param {{ registry?: DeviceRegistry, codes?: CodeStore,
   *           discover?: typeof discoverDevices, learning?: object }} [deps]
   */
  constructor(gladys, deps = {}) {
    this.gladys = gladys;
    this.registry = deps.registry ?? new DeviceRegistry();
    this.codes = deps.codes ?? new CodeStore();
    this.discover = deps.discover ?? discoverDevices;
    this.learning = deps.learning ?? {};
    this.config = normalizeConfig();
    // mac -> last transport published ('local' | 'unreachable').
    this.transports = new Map();
  }

  setConfig(raw) {
    this.config = normalizeConfig(raw);
  }

  get context() {
    return { config: this.config, codes: this.codes };
  }

  /** Register the devices already created in Gladys (from their params). */
  loadCreatedDevices(devices = []) {
    for (const device of devices) this.registry.upsertFromGladysDevice(device);
  }

  /** Scan the network, detect the optional features, then publish. */
  async scan() {
    const found = await this.discover(this.gladys, this.config);
    const transports = [];
    for (const hello of found) {
      const info = this.registry.upsert(hello);
      if (!info) {
        logger.warn(
          `Unsupported Broadlink product 0x${hello.devtype.toString(16)} at ${hello.ip}, ignored`,
        );
        continue;
      }
      if (info.locked) {
        logger.warn(
          `${deviceName(info)} (${info.ip}) is locked: unlock it in the Broadlink app to control it`,
        );
        continue;
      }
      try {
        const capabilities = await getBlueprint(info).probe(this.registry.getClient(info), info);
        this.registry.setCapabilities(info.mac, capabilities);
        transports.push([info, true]);
      } catch (err) {
        logger.warn(`Cannot probe ${deviceName(info)} (${info.ip}): ${err.message}`);
        transports.push([info, false]);
      }
    }
    logger.info(`${found.length} Broadlink device(s) found`);
    await this.publish();
    await this.publishTransports(transports, { force: true });
    return found.length;
  }

  /**
   * Transport badge shown by Gladys on the device cards: Broadlink is
   * local-only, so a device is either 'local' (it answers) or 'unreachable'.
   * Only changes are sent, unless `force` is set (after a scan).
   * @param {Array<[import('./registry.js').DeviceInfo, boolean]>} entries
   */
  async publishTransports(entries, { force = false } = {}) {
    const changed = [];
    for (const [info, reachable] of entries) {
      const transport = reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE;
      if (!force && this.transports.get(info.mac) === transport) continue;
      this.transports.set(info.mac, transport);
      changed.push({ external_id: this.gladys.externalIds(info.kind, info.mac).device, transport });
    }
    if (changed.length === 0) return;
    try {
      await this.gladys.publishTransports(changed);
    } catch (err) {
      // A badge is cosmetic: never fail a command because of it.
      logger.warn(`publishTransports failed: ${err.message}`);
    }
  }

  /**
   * Run a device operation and keep its transport badge up to date: any
   * answer (even a device error) means 'local', no answer means 'unreachable'.
   */
  async track(info, operation) {
    try {
      const result = await operation();
      await this.publishTransports([[info, true]]);
      return result;
    } catch (err) {
      await this.publishTransports([[info, err instanceof BroadlinkDeviceError]]);
      throw err;
    }
  }

  /** Publish every known device (idempotent: upsert by external_id). */
  async publish() {
    await this.gladys.publishDiscoveredDevices(
      buildDiscoveredDevices(this.gladys, this.registry, this.context),
    );
  }

  resolve(gladysDevice) {
    const info = this.registry.findByGladysDevice(this.gladys, gladysDevice);
    if (!info) {
      throw new Error(`Unknown Broadlink device ${gladysDevice.external_id}`);
    }
    return { info, client: this.registry.getClient(info), blueprint: getBlueprint(info) };
  }

  async onSetValue(device, feature, value) {
    const { info, client, blueprint } = this.resolve(device);
    if (typeof blueprint.onSetValue !== 'function') {
      throw new Error(`${deviceName(info)} has nothing to control`);
    }
    await this.track(info, () =>
      blueprint.onSetValue(this.gladys, { feature, value, client, info, codes: this.codes }),
    );
  }

  async onPoll(device) {
    const { info, client, blueprint } = this.resolve(device);
    if (typeof blueprint.onPoll !== 'function') return;
    await this.track(info, () => blueprint.onPoll(this.gladys, { client, info }));
  }

  /** Remote chosen in an action or scene field (a device external_id). */
  resolveRemote(externalId) {
    const resolved = this.resolve({ external_id: externalId });
    if (resolved.info.kind !== 'remote') {
      throw new Error(`${deviceName(resolved.info)} is not a universal remote (RM)`);
    }
    return resolved;
  }

  // --- Manifest actions ------------------------------------------------------

  async learnCode({ device, name, signal = 'ir' }) {
    const { info, client } = this.resolveRemote(device);
    if (this.codes.get(info.mac, name)) {
      throw new Error(`A code named "${name}" already exists on this remote`);
    }
    let code;
    if (signal === 'rf') {
      if (!RF_PROTOCOLS.has(info.protocol)) {
        throw new Error(`${info.model} cannot learn radio (RF) codes, only infrared ones`);
      }
      ({ code } = await learnRfCode(client, info.protocol, this.learning));
    } else {
      code = await learnIrCode(client, info.protocol, this.learning);
    }
    const entry = await this.codes.add(info.mac, name, code);
    await this.publish();
    return {
      en: `Code "${entry.name}" learned (${code.length} bytes). ${DISCOVERY_HINT.en}`,
      fr: `Code « ${entry.name} » appris (${code.length} octets). ${DISCOVERY_HINT.fr}`,
    };
  }

  async importCode({ device, name, code }) {
    const { info } = this.resolveRemote(device);
    const entry = await this.codes.add(info.mac, name, parseCode(code));
    await this.publish();
    return {
      en: `Code "${entry.name}" imported. ${DISCOVERY_HINT.en}`,
      fr: `Code « ${entry.name} » importé. ${DISCOVERY_HINT.fr}`,
    };
  }

  async sendCode({ device, name, repeat = 1 }) {
    const { info, client } = this.resolveRemote(device);
    const entry = this.codes.get(info.mac, name);
    if (!entry) {
      throw new Error(`No code named "${name}" on ${deviceName(info)}`);
    }
    const times = Math.min(10, Math.max(1, Math.trunc(Number(repeat) || 1)));
    for (let i = 0; i < times; i += 1) {
      await sendCode(client, info.protocol, entry.code);
    }
    return {
      en: `Code "${entry.name}" sent.`,
      fr: `Code « ${entry.name} » envoyé.`,
    };
  }

  async deleteCode({ device, name }) {
    const { info } = this.resolveRemote(device);
    if (!(await this.codes.remove(info.mac, name))) {
      throw new Error(`No code named "${name}" on ${deviceName(info)}`);
    }
    await this.publish();
    return {
      en: `Code "${name}" deleted. ${DISCOVERY_HINT.en}`,
      fr: `Code « ${name} » supprimé. ${DISCOVERY_HINT.fr}`,
    };
  }

  listCodes({ device }) {
    const { info } = this.resolveRemote(device);
    const names = this.codes.list(info.mac).map((entry) => entry.name);
    if (names.length === 0) {
      return {
        en: `No code saved on ${deviceName(info)} yet.`,
        fr: `Aucun code enregistré sur ${deviceName(info)} pour l'instant.`,
      };
    }
    return {
      en: `${names.length} code(s) on ${deviceName(info)}: ${names.join(', ')}`,
      fr: `${names.length} code(s) sur ${deviceName(info)} : ${names.join(', ')}`,
    };
  }

  /** Summary of the known devices, for the "list devices" action. */
  listDevices() {
    const devices = this.registry.all();
    if (devices.length === 0) {
      return {
        en: 'No Broadlink device found yet. Run a scan from the Discovery tab.',
        fr: "Aucun appareil Broadlink trouvé pour l'instant. Lancez un scan depuis l'onglet Découverte.",
      };
    }
    const lines = devices.map(
      (info) =>
        `${deviceName(info)} — ${info.model} — ${info.ip} — ${formatMac(info.mac)}${info.locked ? ' (locked)' : ''}`,
    );
    return { en: lines.join('\n'), fr: lines.join('\n') };
  }
}
