// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the only surface the integration relies on and records every
// call so tests can assert them. `scanNetwork` answers with the `scanReplies`
// given at creation (or throws `scanError`).
// -----------------------------------------------------------------------------

export function createFakeGladys({ scanReplies = [], scanError = null } = {}) {
  const published = [];
  const discovered = [];
  const scans = [];
  const transports = [];

  return {
    published,
    discovered,
    scans,
    transports,

    externalIds(type, platformId) {
      const device = `ext:broadlink:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    async scanNetwork(type, options) {
      scans.push({ type, options });
      if (scanError) throw scanError;
      return scanReplies;
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
    },

    async publishState(featureExternalId, state) {
      published.push({ featureExternalId, state });
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({ featureExternalId: s.device_feature_external_id, state: s.state });
      }
    },

    async publishTransports(entries) {
      transports.push(...entries);
    },

    /** Last list given to publishDiscoveredDevices. */
    get lastDiscovered() {
      return discovered.at(-1) ?? [];
    },
  };
}
