// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

import { isIPv4 } from 'node:net';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  // IP addresses typed by the user, for devices the broadcast scan cannot
  // reach (another VLAN...). Comma, space or semicolon separated.
  hosts: '',
  poll_frequency: 60, // seconds, how often plugs and sensors are refreshed
};

export const POLL_FREQUENCY_BOUNDS = { min: 10, max: 3600 };

/** "192.168.1.20, 192.168.1.21" -> ['192.168.1.20', '192.168.1.21'] (invalid entries dropped) */
export function parseHosts(hosts) {
  return [
    ...new Set(
      String(hosts ?? '')
        .split(/[\s,;]+/)
        .map((h) => h.trim())
        .filter((h) => isIPv4(h)),
    ),
  ];
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    hosts: String(raw.hosts ?? DEFAULT_CONFIG.hosts),
    hostList: parseHosts(raw.hosts),
    // Force the type (a form may send a string) and keep it in bounds.
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_BOUNDS.max, Math.max(POLL_FREQUENCY_BOUNDS.min, pollFrequency))
      : DEFAULT_CONFIG.poll_frequency,
  };
}
