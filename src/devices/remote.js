// -----------------------------------------------------------------------------
// Device type: UNIVERSAL REMOTE (RM mini 3, RM pro, RM4 mini, RM4 pro...)
//
// - every IR/RF code learned or imported on the remote becomes a "push button"
//   feature: turning it ON sends the code, then it falls back to OFF;
// - the temperature / humidity sensor (RM pro, RM4 + HTS2 cable) is exposed
//   when the device reports it, and refreshed by polling.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { readRemoteSensors, sendCode } from '../broadlink/commands.js';
import { BroadlinkDeviceError } from '../broadlink/protocol.js';

const DEVICE_TYPE = 'remote';

const logger = createLogger({ name: DEVICE_TYPE });

const FEATURE = {
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  CODE_PREFIX: 'code-',
};

export const CAPABILITIES = { TEMPERATURE: 'temperature', HUMIDITY: 'humidity' };

export const remote = {
  kind: DEVICE_TYPE,

  // Detect the optional sensor: an RM4 without its HTS2 cable answers zeros
  // (or an error). A network error propagates: the capabilities stay unknown.
  async probe(client, info) {
    const sensors = await readRemoteSensors(client, info.protocol).catch((err) => {
      if (err instanceof BroadlinkDeviceError) return null;
      throw err;
    });
    if (!sensors) return [];
    const capabilities = [];
    if (sensors.temperature !== 0 || (sensors.humidity ?? 0) !== 0) {
      capabilities.push(CAPABILITIES.TEMPERATURE);
      if (sensors.humidity !== undefined) capabilities.push(CAPABILITIES.HUMIDITY);
    }
    return capabilities;
  },

  buildFeatures(gladys, info, { config, codes }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const features = codes.list(info.mac).map((entry) => ({
      name: entry.name,
      external_id: ids.feature(`${FEATURE.CODE_PREFIX}${entry.key}`),
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: false, // IR is one-way: nothing confirms the command
      keep_history: false,
    }));

    if (info.capabilities.includes(CAPABILITIES.TEMPERATURE)) {
      features.push({
        name: 'Temperature',
        external_id: ids.feature(FEATURE.TEMPERATURE),
        category: DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.CELSIUS,
        min: -20,
        max: 60,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      });
    }
    if (info.capabilities.includes(CAPABILITIES.HUMIDITY)) {
      features.push({
        name: 'Humidity',
        external_id: ids.feature(FEATURE.HUMIDITY),
        category: DEVICE_FEATURE_CATEGORIES.HUMIDITY_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        min: 0,
        max: 100,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      });
    }
    // Poll only when there is something to read.
    const pollFrequency = info.capabilities.length > 0 ? config.poll_frequency : undefined;
    return { features, pollFrequency };
  },

  async onSetValue(gladys, { feature, value, client, info, codes }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const entry = codes
      .list(info.mac)
      .find((c) => ids.feature(`${FEATURE.CODE_PREFIX}${c.key}`) === feature.external_id);
    if (!entry) {
      throw new Error(`Unknown code feature ${feature.external_id}`);
    }
    if (value !== 1) {
      // Releasing the button does nothing: a code is a one-shot command.
      return;
    }
    logger.info(`Sending code "${entry.name}" with ${info.mac}`);
    await sendCode(client, info.protocol, entry.code);
    // Momentary button: back to OFF once the code is sent.
    await gladys.publishState(feature.external_id, 0);
  },

  async onPoll(gladys, { client, info }) {
    if (info.capabilities.length === 0) return;
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const sensors = await readRemoteSensors(client, info.protocol);
    if (!sensors) return;
    const states = [];
    if (info.capabilities.includes(CAPABILITIES.TEMPERATURE)) {
      states.push({
        device_feature_external_id: ids.feature(FEATURE.TEMPERATURE),
        state: sensors.temperature,
      });
    }
    if (info.capabilities.includes(CAPABILITIES.HUMIDITY) && sensors.humidity !== undefined) {
      states.push({
        device_feature_external_id: ids.feature(FEATURE.HUMIDITY),
        state: sensors.humidity,
      });
    }
    if (states.length > 0) await gladys.publishStates(states);
  },
};
