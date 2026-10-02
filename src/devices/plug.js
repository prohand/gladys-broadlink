// -----------------------------------------------------------------------------
// Device type: SMART PLUG (SP1, SP2, SP mini, SP3, SP3S, SP4...)
// On/off relay, plus the instantaneous power on the models that measure it.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import {
  PLUG_READS_POWER,
  PLUG_READS_STATE,
  getPlugState,
  setPlugPower,
} from '../broadlink/commands.js';
import { BroadlinkDeviceError } from '../broadlink/protocol.js';

const DEVICE_TYPE = 'plug';

const logger = createLogger({ name: DEVICE_TYPE });

const FEATURE = { ON_OFF: 'on-off', POWER: 'power' };

export const CAPABILITIES = { POWER: 'power' };

export const plug = {
  kind: DEVICE_TYPE,

  // SP2S / SP3S always measure the power; an SP4B only when it says so.
  async probe(client, info) {
    if (PLUG_READS_POWER.has(info.protocol)) return [CAPABILITIES.POWER];
    if (info.protocol !== 'sp4b') return [];
    const state = await getPlugState(client, info.protocol).catch((err) => {
      if (err instanceof BroadlinkDeviceError) return null;
      throw err;
    });
    return state?.power !== null && state?.power !== undefined ? [CAPABILITIES.POWER] : [];
  },

  buildFeatures(gladys, info, { config }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const readsState = PLUG_READS_STATE.has(info.protocol);
    const features = [
      {
        name: 'On/Off',
        external_id: ids.feature(FEATURE.ON_OFF),
        category: DEVICE_FEATURE_CATEGORIES.SWITCH,
        type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: readsState,
        keep_history: true,
      },
    ];
    if (info.capabilities.includes(CAPABILITIES.POWER)) {
      features.push({
        name: 'Power',
        external_id: ids.feature(FEATURE.POWER),
        category: DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR,
        type: DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER,
        unit: DEVICE_FEATURE_UNITS.WATT,
        min: 0,
        max: 4000,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      });
    }
    // An SP1 cannot report anything: no polling.
    return { features, pollFrequency: readsState ? config.poll_frequency : undefined };
  },

  async onSetValue(gladys, { feature, value, client, info }) {
    const on = value === 1;
    logger.info(`${info.mac}: relay ${on ? 'ON' : 'OFF'}`);
    await setPlugPower(client, info.protocol, on);
    if (!PLUG_READS_STATE.has(info.protocol)) {
      await gladys.publishState(feature.external_id, on ? 1 : 0);
      return;
    }
    // Publish the state confirmed by the plug.
    const state = await getPlugState(client, info.protocol);
    await gladys.publishState(feature.external_id, state.on ? 1 : 0);
  },

  async onPoll(gladys, { client, info }) {
    if (!PLUG_READS_STATE.has(info.protocol)) return;
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const state = await getPlugState(client, info.protocol);
    const states = [
      { device_feature_external_id: ids.feature(FEATURE.ON_OFF), state: state.on ? 1 : 0 },
    ];
    if (info.capabilities.includes(CAPABILITIES.POWER) && state.power !== null) {
      states.push({ device_feature_external_id: ids.feature(FEATURE.POWER), state: state.power });
    }
    await gladys.publishStates(states);
  },
};
