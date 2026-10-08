# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.3.2] - 2026-10-08

- Maintenance release, no functional change.

## [1.3.1] - 2026-10-08

- Maintenance release, no functional change.

## [1.3.0] - 2026-10-08

### Changed

- Remote codes are published as **push buttons** (`button`/`push`) instead of on/off switches:
  Gladys' "turn on the switches" scene action and the voice assistants took the first switch of
  the remote and sent a random code (Vol+…). **Open the Discovery tab and click "Update" on each
  remote** to apply it; the features keep their identity, dashboards and scenes keep working.
- Node.js 22 or later is required (the Docker image ships Node 24).

### Fixed

- A code is emitted only once: its UDP packet was re-sent every second until the remote
  answered, so a lost or slow answer fired the code twice (a TV switched on, then off).
- Two codes added or deleted at the same time could corrupt `codes.json`, and a corrupted file
  made the whole initialization fail. Writes are now queued, and an unreadable file is set aside
  (`codes.json.bad-<date>`) instead of blocking the start.
- A device added (or updated) in Gladys is read at once, even when it was deleted and re-created
  within the refresh interval.
- An unreadable answer (bad checksum, short packet) no longer marks the device unreachable nor
  scans the whole network again.
- An unexpected error outside any handler is logged instead of stopping the integration.

### Documentation

- Lowering the refresh interval below 60 s only applies to devices added afterwards (Gladys keeps
  the polling rhythm a device was created with).

## [1.2.0] - 2026-10-07

### Added

- A device that stops answering triggers a network scan (at most every ten minutes), which finds
  it again when its IP address changed.

### Fixed

- Codes whose names only differ by a symbol (`Vol+` / `Vol-`) get their own key instead of being
  refused, and are looked up by name so each one sends (or deletes) its own code.

## [1.1.0] - 2026-10-06

### Added

- `SECURITY.md`: how to report a vulnerability.
- `CHANGELOG.md`, rebuilt from the release history.
- `CLAUDE.md`: guide for contributors and coding agents (commands, architecture, invariants).

### Changed

- Declare the local transport and publish per-device badges
- Development dependencies updated to their latest versions (ESLint 10.12, Prettier 3.9.9, globals 17.13).

### Fixed

- Plugs, sensors, MP1 strips and RM remotes with a sensor are published with a `poll_frequency` Gladys accepts (in milliseconds) and `should_poll: true`: the interval in seconds made Gladys reject the whole discovery, leaving the Discovery tab empty. The configured interval is now enforced by the integration.
- Sending a code to a remote that does not answer now marks it unreachable, like any other command.

## [1.0.1] - 2026-10-02

First public release.

### Added

- Add Broadlink external integration for Gladys Assistant

[Unreleased]: https://github.com/prohand/gladys-broadlink/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/prohand/gladys-broadlink/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/prohand/gladys-broadlink/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/prohand/gladys-broadlink/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/prohand/gladys-broadlink/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/prohand/gladys-broadlink/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/prohand/gladys-broadlink/releases/tag/v1.0.1
