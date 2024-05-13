# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](#Unreleased)

Add unreleased changes here.

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
