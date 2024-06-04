# Changelog

## 1.3.0

### Minor Changes

- [#505](https://github.com/replayio/replay-cli/pull/505) [`631352b`](https://github.com/replayio/replay-cli/commit/631352b3eca27a2b330972fec9f4d5b859b2fac3) Thanks [@bvaughn](https://github.com/bvaughn)! - For recordings of e2e tests, the test name will be shown as the recording title

### Patch Changes

- [#491](https://github.com/replayio/replay-cli/pull/491) [`a243633`](https://github.com/replayio/replay-cli/commit/a243633a99c32ad3d68055d8a3b8e33c1e9ab05f) Thanks [@Andarist](https://github.com/Andarist)! - Improved the way `recordings.log` gets processed. It should fix parsing issues when the log contains strings with `}{` inside them.

- [#500](https://github.com/replayio/replay-cli/pull/500) [`1740c99`](https://github.com/replayio/replay-cli/commit/1740c99639c2ad0e941fa4d9bff8830ba9e16ae1) Thanks [@Andarist](https://github.com/Andarist)! - The launched browser will now get correctly closed on Ctrl+C when recording

## 1.2.0

### Minor Changes

- [#496](https://github.com/replayio/replay-cli/pull/496) [`52646e3`](https://github.com/replayio/replay-cli/commit/52646e3c30784707b1d18540293eb35c32fa30b0) Thanks [@bvaughn](https://github.com/bvaughn)! - Require Replay browser to exit before creating a new recording.

### Patch Changes

- [#492](https://github.com/replayio/replay-cli/pull/492) [`b3c797a`](https://github.com/replayio/replay-cli/commit/b3c797aad1c82a919552ae8f1dc83bb1a7714f18) Thanks [@Andarist](https://github.com/Andarist)! - Assets (like source maps) still referenced by other recordings won't be removed prematurely when removing a recording

## [1.1.0](#1.1.0) - 2024-05-22

### Added

- Added message about Windows browser being unsupported (#474)

## [1.1.0](#1.1.0) - 2024-05-13

### Added

- Basic usage telemetry added using Mixpanel; note that no personal information is stored (#430)

### Changed

- Don't try to group related recordings; just sort them reverse chronologically (#442)
- More reliably select correct build to update to based on CPU architecture (#451)

## [1.0.7](#1.0.7) - 2024-05-05

### Fixed

- Update cached refresh tokens to avoid having to login again prematurely (#429)
- Disable animated log output for non-TTY instances (#432)
- Login command works on Windows (#433)
- Fix possible error when pressing a button to stop recording (#434)

## [1.0.6](#1.0.6) - 2024-05-01

### Changed

- Don't list recordings for new/empty tabs (#424)

### Fixed

- Show "_upload failed_" status when listing recordings (#419)

## [1.0.5](#1.0.5) - 2024-04-23

### Fixed

- Record command better handles when Replay browser is already running (#410)
- Update command also checks for an NPM package update (#412)

## [1.0.4](#1.0.4) - 2024-04-18

### Added

- Record command supports `--verbose` flag to debugging runtime behavior (#407)

### Changed

- List command formatting improvements (#406)
- Record command saves runtime crash information to log file (#408)

## [1.0.3](#1.0.3) - 2024-04-17

### Changed

- Info and list commands no longer require authentication (#400)
- Log runtime `stdout`/`stderr` output when debugging (#402)
- Do not print an empty recordings table (#403)

### Fixed

- Better support non-TTY instances by not blocking on user input (#399)
- Pass `RECORD_REPLAY_DIRECTORY` environment variable through to runtime (#401)

## [1.0.2](#1.0.2) - 2024-04-16

### Changed

- Disable animated log for CI environments (#396)

## [1.0.1](#1.0.1) - 2024-04-16

- Update command no longer requires authentication (#393)

## [1.0.0](#1.0.0) - 2024-04-15

Initial release.
