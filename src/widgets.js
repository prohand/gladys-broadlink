// -----------------------------------------------------------------------------
// Dashboard widget "Broadlink remote" (manifest `widgets`, Gladys >= 5.1).
//
// A virtual remote on the dashboard: the codes of one RM as buttons, plus its
// temperature / humidity tiles when it has the sensor. The content is pure
// (built from the registry and the code store, never from a network read), so
// a dashboard left open costs the RM nothing; only a tap sends a code.
//
// Why `action` buttons and never `device_feature` ones: a code learned after
// the device was created is not a Gladys feature until the user clicks
// "Update" in the Discovery tab, so a button bound to its feature would fail.
// The action goes through `sendCode`, which only needs the code store.
//
// The core keeps 4 buttons per content: up to 3 codes chosen in the widget
// settings (or the first 3), and a "More codes" button opening a form with
// every other code and a repeat count.
// -----------------------------------------------------------------------------

import { CAPABILITIES } from './devices/remote.js';

export const WIDGETS = { REMOTE: 'remote' };

// Action keys are unique within a content: one per code button, one for the form.
export const WIDGET_ACTIONS = { CODE_PREFIX: 'code_', MORE: 'more_codes' };

// Buttons left for the codes once the "More codes" button has its place.
export const MAX_CODE_BUTTONS = 3;
// Options of the "More codes" select: a form, not a catalog.
export const MAX_FORM_OPTIONS = 50;
// Widget texts are truncated by the core: stay within its bounds.
const BUTTON_LABEL_LENGTH = 24;
const OPTION_LABEL_LENGTH = 40;

const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

// A code name is the user's own word: the same in every language.
const sameInEveryLanguage = (text) => ({ en: text, fr: text, de: text, es: text });

/** "TV on, Vol+" -> ['tv on', 'vol+'] (compared case-insensitively). */
export function parseCodeSelection(text) {
  return String(text ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
}

/**
 * Codes shown as buttons: the ones named in the settings (in that order, unknown
 * names skipped), else the first ones of the remote.
 * @param {Array<{ name: string }>} codes every code of the remote
 * @param {string} [selection] the `codes` setting
 */
export function pickButtonCodes(codes, selection) {
  const wanted = parseCodeSelection(selection);
  if (wanted.length === 0) return codes.slice(0, MAX_CODE_BUTTONS);
  const picked = [];
  for (const name of wanted) {
    const entry = codes.find((code) => code.name.toLowerCase() === name);
    if (entry && !picked.includes(entry)) picked.push(entry);
  }
  return picked.slice(0, MAX_CODE_BUTTONS);
}

const TEXTS = {
  unknown: {
    en: 'This device is not a known Broadlink remote (RM). Pick a remote in the widget settings.',
    fr: "Cet appareil n'est pas une télécommande Broadlink (RM) connue. Choisissez une télécommande dans les réglages du widget.",
    de: 'Dieses Gerät ist keine bekannte Broadlink-Fernbedienung (RM). Wähle eine Fernbedienung in den Widget-Einstellungen.',
    es: 'Este dispositivo no es un mando Broadlink (RM) conocido. Elija un mando en los ajustes del widget.',
  },
  noCode: {
    en: 'No code on this remote yet: learn or import one from the Configuration screen of the integration.',
    fr: "Aucun code sur cette télécommande pour l'instant : apprenez-en ou importez-en un depuis l'écran Configuration de l'intégration.",
    de: 'Noch kein Code auf dieser Fernbedienung: Lerne oder importiere einen im Konfigurationsbildschirm der Integration.',
    es: 'Todavía no hay ningún código en este mando: aprenda o importe uno desde la pantalla Configuración de la integración.',
  },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Luftfeuchtigkeit', es: 'Humedad' },
  more: { en: 'More codes', fr: 'Autres codes', de: 'Weitere Codes', es: 'Más códigos' },
  code: { en: 'Code', fr: 'Code', de: 'Code', es: 'Código' },
  repeat: {
    en: 'Times to send it',
    fr: "Nombre d'envois",
    de: 'Anzahl der Sendungen',
    es: 'Número de envíos',
  },
};

/**
 * Content of the "Broadlink remote" widget.
 * @param {object} gladys SDK instance (for the feature external_ids)
 * @param {import('./registry.js').DeviceInfo | null} info the chosen remote, null when unknown
 * @param {Array<{ name: string }>} codes the codes of that remote
 * @param {{ codes?: string }} [settings] widget instance settings
 */
export function buildRemoteWidget(gladys, info, codes, settings = {}) {
  if (!info || info.kind !== 'remote') {
    return { ttl_seconds: 300, components: [{ type: 'text', text: TEXTS.unknown }] };
  }
  const ids = gladys.externalIds(info.kind, info.mac);
  const components = [];
  // Live tiles: the core follows the published states, no nudge needed.
  if (info.capabilities.includes(CAPABILITIES.TEMPERATURE)) {
    components.push({
      type: 'value',
      label: TEXTS.temperature,
      icon: 'thermometer',
      device_feature: ids.feature(CAPABILITIES.TEMPERATURE),
    });
  }
  if (info.capabilities.includes(CAPABILITIES.HUMIDITY)) {
    components.push({
      type: 'value',
      label: TEXTS.humidity,
      icon: 'droplet',
      device_feature: ids.feature(CAPABILITIES.HUMIDITY),
    });
  }
  if (codes.length === 0) {
    components.push({ type: 'text', text: TEXTS.noCode });
    return { ttl_seconds: 300, components };
  }
  const shown = pickButtonCodes(codes, settings.codes);
  shown.forEach((entry, index) => {
    components.push({
      type: 'button',
      label: clip(entry.name, BUTTON_LABEL_LENGTH),
      icon: 'radio',
      style: index === 0 ? 'primary' : 'secondary',
      action: { key: `${WIDGET_ACTIONS.CODE_PREFIX}${index + 1}`, params: { code: entry.name } },
    });
  });
  const others = codes.filter((entry) => !shown.includes(entry));
  if (others.length > 0) {
    components.push({
      type: 'button',
      label: TEXTS.more,
      icon: 'list',
      style: 'secondary',
      action: {
        key: WIDGET_ACTIONS.MORE,
        fields: [
          {
            key: 'code',
            type: 'select',
            label: TEXTS.code,
            required: true,
            default: others[0].name,
            options: others.slice(0, MAX_FORM_OPTIONS).map((entry) => ({
              value: entry.name,
              label: sameInEveryLanguage(clip(entry.name, OPTION_LABEL_LENGTH)),
            })),
          },
          {
            key: 'repeat',
            type: 'number',
            label: TEXTS.repeat,
            required: false,
            min: 1,
            max: 10,
            default: 1,
          },
        ],
      },
    });
  }
  // Codes only change through the Configuration screen actions, which nudge
  // the widget; the tiles are live. A slow ttl is enough.
  return { ttl_seconds: 600, components };
}
