# @replayio/playwright

## 5.0.0

### Major Changes

- [#634](https://github.com/replayio/replay-cli/pull/634) [`3ffcb13`](https://github.com/replayio/replay-cli/commit/3ffcb1372b05fbc4598584d56fdf67470d26d33e) Thanks [@Andarist](https://github.com/Andarist)! - Removed `createReplayReporterConfig` and `getMetadataFilePath` exports

- [#634](https://github.com/replayio/replay-cli/pull/634) [`3ffcb13`](https://github.com/replayio/replay-cli/commit/3ffcb1372b05fbc4598584d56fdf67470d26d33e) Thanks [@Andarist](https://github.com/Andarist)! - Removed support for setting custom `metadata` using config options

### Patch Changes

- [#634](https://github.com/replayio/replay-cli/pull/634) [`3ffcb13`](https://github.com/replayio/replay-cli/commit/3ffcb1372b05fbc4598584d56fdf67470d26d33e) Thanks [@Andarist](https://github.com/Andarist)! - Fixed a race condition causing recordings sometimes not being correctly associated with tests

## 4.0.0

### Major Changes

- [#631](https://github.com/replayio/replay-cli/pull/631) [`065ac4d`](https://github.com/replayio/replay-cli/commit/065ac4d51f320955ee3caaee07ad5d90e7864952) Thanks [@Andarist](https://github.com/Andarist)! - Bumped minimum required Playwright version to 1.52

## 3.1.9

### Patch Changes

- [#624](https://github.com/replayio/replay-cli/pull/624) [`82852c2`](https://github.com/replayio/replay-cli/commit/82852c2d1e9f58c7036a8c0ab5b50e8ef79efa3e) Thanks [@bvaughn](https://github.com/bvaughn)! - Improve async initialization and teardown logic

## 3.1.8

### Patch Changes

- [#592](https://github.com/replayio/replay-cli/pull/592) [`134591c`](https://github.com/replayio/replay-cli/commit/134591ccd4ead6098aa855f2b751b505f43c7b80) Thanks [@Andarist](https://github.com/Andarist)! - Improved resiliency to GitHub API errors when auto-populating PR-related information metadata

- [#613](https://github.com/replayio/replay-cli/pull/613) [`8cd22ea`](https://github.com/replayio/replay-cli/commit/8cd22ea858e0b123551384e87ce4c7e38027f849) Thanks [@hbenl](https://github.com/hbenl)! - Add a trailing log line in case another playwright reporter removes our last line

- [#614](https://github.com/replayio/replay-cli/pull/614) [`0ee7425`](https://github.com/replayio/replay-cli/commit/0ee74258c968fe44f437c9c52e9c724f03ba286b) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue that could cause the reporter to miss test body steps when `beforeAll` hook was used

## 3.1.7

### Patch Changes

- [#603](https://github.com/replayio/replay-cli/pull/603) [`f2b1c82`](https://github.com/replayio/replay-cli/commit/f2b1c82ef9df926d3cc94aae1e3e8a26fb82042a) Thanks [@bvaughn](https://github.com/bvaughn)! - Gather data about deprecated `filter` config usage (as preparation to remove it)

## 3.1.6

### Patch Changes

- [#586](https://github.com/replayio/replay-cli/pull/586) [`2d78191`](https://github.com/replayio/replay-cli/commit/2d781914e81e8d19a31af3d3abdab40d2dbc0f29) Thanks [@bvaughn](https://github.com/bvaughn)! - Only save test data for tests run with Replay browser

- [#573](https://github.com/replayio/replay-cli/pull/573) [`9494138`](https://github.com/replayio/replay-cli/commit/9494138fe6235fd365ce952be384524d30415f21) Thanks [@hbenl](https://github.com/hbenl)! - Log broken entries when reading the recordings.log file

- [#585](https://github.com/replayio/replay-cli/pull/585) [`543dfc9`](https://github.com/replayio/replay-cli/commit/543dfc99e42dbb206c051e98f666f5d35653e0e6) Thanks [@Andarist](https://github.com/Andarist)! - Improve the warning about Replay-less executions

## 3.1.5

### Patch Changes

- Updated dependencies [[`40beb19`](https://github.com/replayio/replay-cli/commit/40beb199c1d1dec640611fec0e04e911e24b5fe3)]:
  - @replayio/replay@0.22.10
  - @replayio/test-utils@3.0.5

## 3.1.4

### Patch Changes

- Updated dependencies []:
  - @replayio/replay@0.22.9
  - @replayio/test-utils@3.0.4

## 3.1.3

### Patch Changes

- Updated dependencies [[`40a1ec8`](https://github.com/replayio/replay-cli/commit/40a1ec8a828b398605c3855746d675bea3090d0c)]:
  - @replayio/test-utils@3.0.3
  - @replayio/replay@0.22.8

## 3.1.2

### Patch Changes

- Updated dependencies [[`0488c9f`](https://github.com/replayio/replay-cli/commit/0488c9f9cbffe33b1a52b1109c7765802a0ed304)]:
  - @replayio/test-utils@3.0.2

## 3.1.1

### Patch Changes

- [#540](https://github.com/replayio/replay-cli/pull/540) [`a6f8f10`](https://github.com/replayio/replay-cli/commit/a6f8f105654b39c5c457dfac91c5169f0ba6cc04) Thanks [@Andarist](https://github.com/Andarist)! - Avoid reporting duplicated API errors

- Updated dependencies [[`a6f8f10`](https://github.com/replayio/replay-cli/commit/a6f8f105654b39c5c457dfac91c5169f0ba6cc04)]:
  - @replayio/test-utils@3.0.1

## 3.1.0

### Minor Changes

- [#513](https://github.com/replayio/replay-cli/pull/513) [`d56ebda`](https://github.com/replayio/replay-cli/commit/d56ebda0a761ee6cf531a1e86d0fa99f7f192df5) Thanks [@Andarist](https://github.com/Andarist)! - Use the current branch name as the default run title in non-CI runs

- [#536](https://github.com/replayio/replay-cli/pull/536) [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c) Thanks [@Andarist](https://github.com/Andarist)! - Correctly correlate recordings with tests utilizing `repeatEach`

### Patch Changes

- [#519](https://github.com/replayio/replay-cli/pull/519) [`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170) Thanks [@Andarist](https://github.com/Andarist)! - Added new `upload` options:

  - `statusThreshold`: this accepts one of `'all'`, `'failed-and-flaky'` or `'failed'` and it's used to skip uploading recordings for test runs that don't satisfy the desired threshold (eg. it allows to filter out recordings of passed tests)
  - `minimizeUploads`: a boolean flag that helps to minimize the amount of uploaded recordings. With this flag a minimal set of recordings associated with a retried test is uploaded

- Updated dependencies [[`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170), [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c), [`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170), [`d56ebda`](https://github.com/replayio/replay-cli/commit/d56ebda0a761ee6cf531a1e86d0fa99f7f192df5), [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c)]:
  - @replayio/replay@0.22.7
  - @replayio/test-utils@3.0.0

## 3.0.3

### Patch Changes

- [#516](https://github.com/replayio/replay-cli/pull/516) [`c27e2af`](https://github.com/replayio/replay-cli/commit/c27e2afa983dab6668c90a7b4704ef42f4836ec7) Thanks [@Andarist](https://github.com/Andarist)! - Fixed a race condition that could cause some tests not being added correctly to a test run

- Updated dependencies [[`c27e2af`](https://github.com/replayio/replay-cli/commit/c27e2afa983dab6668c90a7b4704ef42f4836ec7)]:
  - @replayio/test-utils@2.1.2
  - @replayio/replay@0.22.6

## 3.0.2

### Patch Changes

- [#501](https://github.com/replayio/replay-cli/pull/501) [`e7c637c`](https://github.com/replayio/replay-cli/commit/e7c637ca95fc1ba649fd8cc87fc15059250f8ae1) Thanks [@Andarist](https://github.com/Andarist)! - Make `RECORD_REPLAY_ENABLE_ASSERTS` environment forwardable to the browser process

- [#502](https://github.com/replayio/replay-cli/pull/502) [`9122af4`](https://github.com/replayio/replay-cli/commit/9122af45618741cf2b222b461eddee016e38db43) Thanks [@Andarist](https://github.com/Andarist)! - Added a warning when the reporter gets used without the Replay browser

## 3.0.1

### Patch Changes

- [#488](https://github.com/replayio/replay-cli/pull/488) [`e6b79b4`](https://github.com/replayio/replay-cli/commit/e6b79b4821b894522bce0ea00f04e7d1ba6d7e3b) Thanks [@callingmedic911](https://github.com/callingmedic911)! - Skip Replay browser installation check on Windows
