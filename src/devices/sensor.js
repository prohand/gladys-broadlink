// -----------------------------------------------------------------------------
// Device type: ENVIRONMENT SENSOR (A1)
// Temperature + humidity, refreshed by polling.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { readA1Sensors } from '../broadlink/commands.js';

const DEVICE_TYPE = 'sensor';

const FEATURE = { TEMPERATURE: 'temperature', HUMIDITY: 'humidity' };

export const sensor = {
  kind: DEVICE_TYPE,

  async probe() {
    return [];
  },

  buildFeatures(gladys, info, { config }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const features = [
      {
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
      },
      {
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
      },
    ];
    return { features, pollFrequency: config.poll_frequency };
  },

  async onPoll(gladys, { client, info }) {
    const ids = gladys.externalIds(DEVICE_TYPE, info.mac);
    const { temperature, humidity } = await readA1Sensors(client);
    await gladys.publishStates([
      { device_feature_external_id: ids.feature(FEATURE.TEMPERATURE), state: temperature },
      { device_feature_external_id: ids.feature(FEATURE.HUMIDITY), state: humidity },
    ]);
  },
};
