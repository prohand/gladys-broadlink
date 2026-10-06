# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 20+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Broadlink** devices, 100 % local (no
Broadlink account or cloud). The Broadlink protocol is re-implemented in plain JavaScript after
[python-broadlink](https://github.com/mjg59/python-broadlink). Requires Gladys 5.1.0+.

Supported: RM universal remotes (learn/import IR and RF codes, each code becomes a momentary
button, temperature/humidity on RM pro / RM4 + HTS2), SP plugs (on/off, power on SP2S/SP3S/SP4B),
MP1 power strip (4 outlets), A1 sensor.

## Commands

```bash
npm install
npm test                                   # node --test (built-in runner)
node --test test/protocol.test.js          # one file
node --test --test-name-pattern "MP1"      # one test by name
npm run lint                               # eslint .
npm run format:check                       # prettier --check . (CI gate)
npm run format                             # prettier --write .
```

CI runs `format:check`, `lint`, `test`. Releases: **Actions → Release** only (bumps
`package.json`, manifest `version` + `docker_image`, re-runs Prettier on the manifest, tags,
builds). Never bump versions by hand.

## Architecture

```
index.js                 SDK wiring only (handlers before connect())
src/integration.js       BroadlinkIntegration: scan, commands, poll, manifest + scene actions
src/discovery.js         discovery: core-side broadcast (manifest network_discovery) + manual IPs
src/registry.js          known devices (from scans and from Gladys devices) + one client each
src/codes.js             IR/RF code store, JSON in /data, keyed by remote MAC
src/learning.js          IR / RF learning sequences
src/config.js            defaults, manual host list, refresh interval bounds
src/broadlink/protocol.js  packets, checksums, AES-128-CBC
src/broadlink/udp.js     UDP request/response
src/broadlink/client.js  authenticated session with one device
src/broadlink/commands.js  RM / SP / MP1 / A1 commands
src/broadlink/models.js  devtype -> model / kind / protocol table
src/devices/             one blueprint per Gladys device kind: remote, plug, strip, sensor
```

### Invariants worth knowing

- **The container cannot broadcast** (bridge network): discovery is asked to the Gladys core
  through the manifest `network_discovery` (`udp-active-broadcast`, port 80). A manual IP list
  (`hosts`) is the fallback for other VLANs.
- **Identity = device MAC** (`ext:<selector>:<kind>:<mac>`). Codes are keyed by MAC too. Changing
  either shape orphans users' devices and codes.
- **Devices already created in Gladys are drivable before any scan**
  (`loadCreatedDevices` rebuilds the registry from their params).
- **Locked devices** (locked in the Broadlink app) refuse local commands: they are logged and
  left out of discovery.
- **Each learned/imported code is a feature** of its remote: adding or deleting a code
  re-publishes the catalog and the user must click "Update" in the Discovery tab.
- **Polling**: Gladys `poll_frequency` is an enum in MILLISECONDS (1000, 2000, 10000, 15000,
  30000, 60000); any other value rejects the WHOLE discovery batch, and Gladys only polls a
  device that also carries `should_poll: true`. The configured interval (`poll_frequency`,
  10–3600 s) is in seconds and must never be published as is.
- **Transport badge** (`transports: ["local"]`): `local` or `unreachable`, updated by `track()`
  around every command and poll.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- **`/data` is the only writable path** (`BROADLINK_DATA_DIR` overrides it for tests); writes are
  atomic (tmp + rename).
- Action keys and the scene action `send_code` are stored by users: never rename them.

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with `DEFAULT_CONFIG`,
the bounds, `ACTIONS` and `SCENE_ACTIONS`.

## Testing

Protocol tests compare generated packets with the bytes python-broadlink produces for the same
inputs. Integration tests run fake Broadlink devices over UDP on `127.0.0.1`
(`test/helpers/fakeBroadlinkDevice.js`); `test/helpers/fakeGladys.js` stands in for the SDK. No
network beyond loopback.

## Conventions

Prettier formats, ESLint catches mistakes. Comments explain **why**, in English. User-facing
messages are bilingual `{ en, fr }`; the README and `docs/fr.md` are French, `docs/en.md` English:
keep the docs in sync.
