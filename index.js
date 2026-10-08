// -----------------------------------------------------------------------------
// Entry point of the Broadlink external integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the integration logic (src/integration.js).
// It holds NO protocol logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, scans the network and publishes the discovered devices.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { ACTIONS, BroadlinkIntegration, SCENE_ACTIONS } from './src/integration.js';

const gladys = new GladysIntegration();
const broadlink = new BroadlinkIntegration(gladys);

// Safety net: a promise rejected outside any handler (a background rescan, a
// timer callback) would otherwise kill the container on Node >= 15, dropping
// every device until the supervisor restarts it. Log it and keep running; a
// real crash (uncaughtException) still ends the process.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

// --- Discovery: the user clicks "Scan" in the Discovery tab ------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> scanning the network');
  await broadlink.scan();
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await broadlink.onSetValue(device, feature, value);
});

// --- Polling: Gladys asks to refresh a device --------------------------------
gladys.onPoll(async (device) => {
  await broadlink.onPoll(device);
});

// --- A device was created / updated in Gladys: drive and read it right away --
// States published before the device existed were dropped by Gladys.
gladys.onDeviceCreated(async (device) => {
  await broadlink.refreshCreatedDevice(device);
});

gladys.onDeviceUpdated(async (device) => {
  await broadlink.refreshCreatedDevice(device);
});

// --- Manifest actions: buttons in the Configuration screen -------------------
// The message resolved by the handler is displayed under the button; a thrown
// error is displayed too.
for (const [key, method] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields = {}) => broadlink[method](fields));
}

// --- Scene actions: run from a scene (e.g. "send the TV on code at 8 pm") ----
// No declared outputs: resolve undefined.
for (const [key, method] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(key, async (fields = {}) => {
    await broadlink[method](fields);
  });
}

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  broadlink.setConfig(newConfig);
  // New addresses to probe, new polling frequency: scan and re-publish.
  await broadlink.scan();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    // 1) Config filled in by the user + codes saved in /data.
    broadlink.setConfig(await gladys.getConfig());
    await broadlink.codes.load();

    // 2) Devices already created in Gladys: drivable before any scan.
    broadlink.loadCreatedDevices(gladys.devices ?? (await gladys.getDevices()));

    // 3) Scan the network and publish what was found.
    await broadlink.scan();

    await gladys.setConnectionStatus(true);
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await gladys
      .setConnectionStatus(false, {
        en: 'Initialization failed, check the integration logs.',
        fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      })
      .catch(() => {});
  }
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Broadlink integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
