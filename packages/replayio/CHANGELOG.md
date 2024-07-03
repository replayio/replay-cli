# Changelog

## 1.5.0

### Minor Changes

- [#572](https://github.com/replayio/replay-cli/pull/572) [`db3f422`](https://github.com/replayio/replay-cli/commit/db3f422416d9385db543e9d4876752a159adfa79) Thanks [@bvaughn](https://github.com/bvaughn)! - Add "whoami" command to print information about the current user and API key

## 1.4.3

### Patch Changes

- Updated dependencies [[`e7bd234`](https://github.com/replayio/replay-cli/commit/e7bd234980e9dfc7ab9584d47ebaf1812712f291)]:
  - @replayio/sourcemap-upload@2.0.6

## 1.4.2

### Patch Changes

- Updated dependencies [[`89c5082`](https://github.com/replayio/replay-cli/commit/89c5082a06265255ffdc8b4f1e87dcb1d3d9c2d2)]:
  - @replayio/sourcemap-upload@2.0.5

## 1.4.1

### Patch Changes

- [#550](https://github.com/replayio/replay-cli/pull/550) [`678082b`](https://github.com/replayio/replay-cli/commit/678082bbc3a2909bb747d936dc85ec5689f42152) Thanks [@Andarist](https://github.com/Andarist)! - Add an explicit dependency on `uuid` module

- [#546](https://github.com/replayio/replay-cli/pull/546) [`e042f96`](https://github.com/replayio/replay-cli/commit/e042f9646481fd6aa522a0cccbed6eec44629f77) Thanks [@Andarist](https://github.com/Andarist)! - Add an explicit dependency on `chalk` module

## 1.4.0

### Minor Changes

- [#536](https://github.com/replayio/replay-cli/pull/536) [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c) Thanks [@Andarist](https://github.com/Andarist)! - Export a new version of the new test run metadata validator

### Patch Changes

- [#526](https://github.com/replayio/replay-cli/pull/526) [`b7113e9`](https://github.com/replayio/replay-cli/commit/b7113e9d17e14620184ca6a3a6836ae1b50751b1) Thanks [@bvaughn](https://github.com/bvaughn)! - Add "open" command to open Replay browser in non-recording mode

- [#535](https://github.com/replayio/replay-cli/pull/535) [`6ed4119`](https://github.com/replayio/replay-cli/commit/6ed4119c36998fc14a8cbd6458fe07f251ce19dd) Thanks [@Andarist](https://github.com/Andarist)! - Add an explicit dependency on `strip-ansi` module

## 1.3.2

### Patch Changes

- [#439](https://github.com/replayio/replay-cli/pull/439) [`75ee1cb`](https://github.com/replayio/replay-cli/commit/75ee1cb037de7e86f047ffe79dc84b1423c28aaa) Thanks [@bvaughn](https://github.com/bvaughn)! - Show the reason for recordings failures if it is known (e.g. a stack overflow)

- Updated dependencies [[`75d475a`](https://github.com/replayio/replay-cli/commit/75d475ad5aed0c331cfc3b36bdcd8e7822b58c39)]:
  - @replayio/sourcemap-upload@2.0.4

## 1.3.1

### Patch Changes

- [#503](https://github.com/replayio/replay-cli/pull/503) [`4954cd1`](https://github.com/replayio/replay-cli/commit/4954cd14547359936842b2d3c59d6f138eab21ba) Thanks [@Andarist](https://github.com/Andarist)! - Added automatic browser crash reporting to the Replay team

- [#511](https://github.com/replayio/replay-cli/pull/511) [`bf2c72d`](https://github.com/replayio/replay-cli/commit/bf2c72df7c076fd824f03511b707cb109e325c12) Thanks [@hbenl](https://github.com/hbenl)! - Handle unexpected ordering of recording log entries

- [#508](https://github.com/replayio/replay-cli/pull/508) [`e0ce74f`](https://github.com/replayio/replay-cli/commit/e0ce74f) Thanks [@hbenl](https://github.com/hbenl)! - Fixed a potential data corruption issue related to the `recordings.log` updates

- [#509](https://github.com/replayio/replay-cli/pull/509) [`45d5067`](https://github.com/replayio/replay-cli/commit/45d5067bbf570628a53d45e6e5eb4c98cebd66e1) Thanks [@hbenl](https://github.com/hbenl)! - Change `replayio remove --all` to also remove empty recordings

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
