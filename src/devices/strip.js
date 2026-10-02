// -----------------------------------------------------------------------------
// Device type: POWER STRIP (MP1)
// Four independently switchable outlets.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
} from '@gladysassistant/integration-sdk';
import { STRIP_OUTLETS, getStripState, setStripOutlet } from '../broadlink/commands.js';

const DEVICE_TYPE = 'strip';

const logger = createLogger({ name: DEVICE_TYPE });

const outletKey = (outlet) => `outlet-${outlet}`;

export const strip = {
  kind: DEVICE_TYPE,

  async probe() {
    return [];
  },

  buildFeatures(gladys, info, { config }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const features = Array.from({ length: STRIP_OUTLETS }, (_, i) => ({
      name: `Outlet ${i + 1}`,
      external_id: ids.feature(outletKey(i + 1)),
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
      keep_history: true,
    }));
    return { features, pollFrequency: config.poll_frequency };
  },

  async onSetValue(gladys, { feature, value, client, info }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const outlet = Array.from({ length: STRIP_OUTLETS }, (_, i) => i + 1).find(
      (n) => ids.feature(outletKey(n)) === feature.external_id,
    );
    if (!outlet) {
      throw new Error(`Unknown outlet feature ${feature.external_id}`);
    }
    const on = value === 1;
    logger.info(`${info.mac}: outlet ${outlet} ${on ? 'ON' : 'OFF'}`);
    await setStripOutlet(client, outlet, on);
    const outlets = await getStripState(client);
    await gladys.publishState(feature.external_id, outlets[outlet - 1] ? 1 : 0);
  },

  async onPoll(gladys, { client, info }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const outlets = await getStripState(client);
    await gladys.publishStates(
      outlets.map((on, i) => ({
        device_feature_external_id: ids.feature(outletKey(i + 1)),
        state: on ? 1 : 0,
      })),
    );
  },
};
