// -----------------------------------------------------------------------------
// Storage of the IR / RF codes learned (or imported) on the remotes.
//
// Codes live in a JSON file on the only writable volume of the container
// (/data), keyed by the MAC of the remote that owns them:
//   { "<mac>": { "<key>": { "name": "TV on", "code": "<base64>", "created_at": "..." } } }
// The key is a slug of the name: it builds the Gladys feature external_id, so
// it must stay stable once the code is created.
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeMac } from './broadlink/protocol.js';

export const DEFAULT_DATA_DIR = process.env.BROADLINK_DATA_DIR ?? '/data';

export const MAX_CODE_NAME_LENGTH = 50;

/** "TV - On / Off" -> "tv-on-off" */
export function slugify(name) {
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_CODE_NAME_LENGTH);
}

/**
 * Parse a code typed by the user: hexadecimal ("2600500000012...") or base64
 * ("JgBQAAABK..." — the format used by Home Assistant and most tools).
 * @param {string} text
 * @returns {Buffer}
 */
export function parseCode(text) {
  const clean = String(text ?? '').replace(/\s+/g, '');
  if (clean.length === 0) {
    throw new Error('The code is empty');
  }
  let code;
  if (/^[0-9a-f]+$/i.test(clean) && clean.length % 2 === 0) {
    code = Buffer.from(clean, 'hex');
  } else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(clean)) {
    code = Buffer.from(clean.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } else {
    throw new Error('The code must be in hexadecimal or base64');
  }
  if (code.length < 4) {
    throw new Error('The code is too short to be a Broadlink code');
  }
  return code;
}

export class CodeStore {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.file = path.join(dataDir, 'codes.json');
    this.codes = {};
  }

  async load() {
    try {
      this.codes = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.codes = {};
    }
    return this;
  }

  async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    // Write then rename: a crash never leaves a half-written file.
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.codes, null, 2));
    await rename(tmp, this.file);
  }

  /** @returns {Array<{ key: string, name: string, code: Buffer }>} sorted by name */
  list(mac) {
    const entries = this.codes[normalizeMac(mac)] ?? {};
    return Object.entries(entries)
      .map(([key, entry]) => ({ key, name: entry.name, code: Buffer.from(entry.code, 'base64') }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Find a code by its name (case-insensitive) or its key. */
  get(mac, name) {
    const key = slugify(name);
    return this.list(mac).find((entry) => entry.key === key);
  }

  /**
   * @param {string} mac
   * @param {string} name
   * @param {Buffer} code
   */
  async add(mac, name, code) {
    const cleanName = String(name ?? '').trim();
    const key = slugify(cleanName);
    if (!key) {
      throw new Error('The code name must contain at least one letter or digit');
    }
    const deviceCodes = (this.codes[normalizeMac(mac)] ??= {});
    if (deviceCodes[key]) {
      throw new Error(`A code named "${deviceCodes[key].name}" already exists on this remote`);
    }
    deviceCodes[key] = {
      name: cleanName.slice(0, MAX_CODE_NAME_LENGTH),
      code: code.toString('base64'),
      created_at: new Date().toISOString(),
    };
    await this.save();
    return { key, name: deviceCodes[key].name, code };
  }

  /** @returns {Promise<boolean>} false when the code does not exist */
  async remove(mac, name) {
    const deviceCodes = this.codes[normalizeMac(mac)];
    const key = slugify(name);
    if (!deviceCodes?.[key]) return false;
    delete deviceCodes[key];
    await this.save();
    return true;
  }
}
