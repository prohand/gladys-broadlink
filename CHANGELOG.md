# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-broadlink/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/prohand/gladys-broadlink/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/prohand/gladys-broadlink/releases/tag/v1.0.1
