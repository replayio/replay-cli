# @replayio/cypress

## 3.1.2

### Patch Changes

- [#592](https://github.com/replayio/replay-cli/pull/592) [`134591c`](https://github.com/replayio/replay-cli/commit/134591ccd4ead6098aa855f2b751b505f43c7b80) Thanks [@Andarist](https://github.com/Andarist)! - Improved resiliency to GitHub API errors when auto-populating PR-related information metadata

## 3.1.1

### Patch Changes

- [#603](https://github.com/replayio/replay-cli/pull/603) [`f2b1c82`](https://github.com/replayio/replay-cli/commit/f2b1c82ef9df926d3cc94aae1e3e8a26fb82042a) Thanks [@bvaughn](https://github.com/bvaughn)! - Gather data about deprecated `filter` config usage (as preparation to remove it)

## 3.1.0

### Minor Changes

- [#598](https://github.com/replayio/replay-cli/pull/598) [`0f9764b`](https://github.com/replayio/replay-cli/commit/0f9764ba114471a5f39f76dc1dbcb3265ad02940) Thanks [@Andarist](https://github.com/Andarist)! - Added a new `upload.statusThreshold` option. It accepts one of `'all'`, `'failed-and-flaky'` or `'failed'` and it's used to skip uploading recordings for test runs that don't satisfy the desired threshold (eg. it allows to filter out recordings of passed tests).

## 3.0.7

### Patch Changes

- [#594](https://github.com/replayio/replay-cli/pull/594) [`78f5c72`](https://github.com/replayio/replay-cli/commit/78f5c72a62a38772cad90cccf1283b80eea49b61) Thanks [@miriambudayr](https://github.com/miriambudayr)! - Add missing stack-utils dependencies

## 3.0.6

### Patch Changes

- [#573](https://github.com/replayio/replay-cli/pull/573) [`9494138`](https://github.com/replayio/replay-cli/commit/9494138fe6235fd365ce952be384524d30415f21) Thanks [@hbenl](https://github.com/hbenl)! - Log broken entries when reading the recordings.log file

## 3.0.5

### Patch Changes

- Updated dependencies [[`40beb19`](https://github.com/replayio/replay-cli/commit/40beb199c1d1dec640611fec0e04e911e24b5fe3)]:
  - @replayio/replay@0.22.10
  - @replayio/test-utils@3.0.5

## 3.0.4

### Patch Changes

- Updated dependencies []:
  - @replayio/replay@0.22.9
  - @replayio/test-utils@3.0.4

## 3.0.3

### Patch Changes

- Updated dependencies [[`40a1ec8`](https://github.com/replayio/replay-cli/commit/40a1ec8a828b398605c3855746d675bea3090d0c)]:
  - @replayio/test-utils@3.0.3
  - @replayio/replay@0.22.8

## 3.0.2

### Patch Changes

- Updated dependencies [[`0488c9f`](https://github.com/replayio/replay-cli/commit/0488c9f9cbffe33b1a52b1109c7765802a0ed304)]:
  - @replayio/test-utils@3.0.2

## 3.0.1

### Patch Changes

- [#540](https://github.com/replayio/replay-cli/pull/540) [`a6f8f10`](https://github.com/replayio/replay-cli/commit/a6f8f105654b39c5c457dfac91c5169f0ba6cc04) Thanks [@Andarist](https://github.com/Andarist)! - Avoid reporting duplicated API errors

- Updated dependencies [[`a6f8f10`](https://github.com/replayio/replay-cli/commit/a6f8f105654b39c5c457dfac91c5169f0ba6cc04)]:
  - @replayio/test-utils@3.0.1

## 3.0.0

### Major Changes

- [#525](https://github.com/replayio/replay-cli/pull/525) [`82a525e`](https://github.com/replayio/replay-cli/commit/82a525ee8272585ff60cef002032d41e696f6a90) Thanks [@Andarist](https://github.com/Andarist)! - Removed the CLI script from the package. It's no longer possible to execute `npx @replayio/cypress run`

- [#530](https://github.com/replayio/replay-cli/pull/530) [`81179b9`](https://github.com/replayio/replay-cli/commit/81179b9939155243b8bda4c693e047b2a301a7e7) Thanks [@Andarist](https://github.com/Andarist)! - Bumped the required peer dependency range on Cypress to `^13`

- [#523](https://github.com/replayio/replay-cli/pull/523) [`fd9ae6d`](https://github.com/replayio/replay-cli/commit/fd9ae6d25a38b259d34d114225b78f2b77cc6e54) Thanks [@Andarist](https://github.com/Andarist)! - Removed support for Replay Firefox

- [#524](https://github.com/replayio/replay-cli/pull/524) [`7628818`](https://github.com/replayio/replay-cli/commit/762881862b311d74b7e40c403ad3ebe51f10bf0a) Thanks [@Andarist](https://github.com/Andarist)! - Bumped the minimum supported node version to 18

- [#522](https://github.com/replayio/replay-cli/pull/522) [`342e169`](https://github.com/replayio/replay-cli/commit/342e169d519eb6cf9de0601e283b7db3d8d18b25) Thanks [@Andarist](https://github.com/Andarist)! - Removed `postinstall` script. To install the Replay Chromium please an explicit installation step should be used (such as `npx replayio install`)

### Minor Changes

- [#513](https://github.com/replayio/replay-cli/pull/513) [`d56ebda`](https://github.com/replayio/replay-cli/commit/d56ebda0a761ee6cf531a1e86d0fa99f7f192df5) Thanks [@Andarist](https://github.com/Andarist)! - Use the current branch name as the default run title in non-CI runs

### Patch Changes

- [#537](https://github.com/replayio/replay-cli/pull/537) [`cc8b0b6`](https://github.com/replayio/replay-cli/commit/cc8b0b6f95a807944101c514fd4f759222c1ba6b) Thanks [@hbenl](https://github.com/hbenl)! - Fix cypress assertions getting lost

- [#520](https://github.com/replayio/replay-cli/pull/520) [`a652cd9`](https://github.com/replayio/replay-cli/commit/a652cd983e57a0b14fee1fbdc700dac9e8fbbf3a) Thanks [@bvaughn](https://github.com/bvaughn)! - Fixed an edge case that caused test steps to appear in the wrong order for flaky tests.

- [#530](https://github.com/replayio/replay-cli/pull/530) [`81179b9`](https://github.com/replayio/replay-cli/commit/81179b9939155243b8bda4c693e047b2a301a7e7) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue with `displayError` being incorrectly reused for all test attempts

- Updated dependencies [[`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170), [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c), [`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170), [`d56ebda`](https://github.com/replayio/replay-cli/commit/d56ebda0a761ee6cf531a1e86d0fa99f7f192df5), [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c)]:
  - @replayio/replay@0.22.7
  - @replayio/test-utils@3.0.0

## 2.1.3

### Patch Changes

- [#516](https://github.com/replayio/replay-cli/pull/516) [`c27e2af`](https://github.com/replayio/replay-cli/commit/c27e2afa983dab6668c90a7b4704ef42f4836ec7) Thanks [@Andarist](https://github.com/Andarist)! - Fixed a race condition that could cause some tests not being added correctly to a test run

- Updated dependencies [[`c27e2af`](https://github.com/replayio/replay-cli/commit/c27e2afa983dab6668c90a7b4704ef42f4836ec7)]:
  - @replayio/test-utils@2.1.2
  - @replayio/replay@0.22.6

## 2.1.2

### Patch Changes

- [#501](https://github.com/replayio/replay-cli/pull/501) [`e7c637c`](https://github.com/replayio/replay-cli/commit/e7c637ca95fc1ba649fd8cc87fc15059250f8ae1) Thanks [@Andarist](https://github.com/Andarist)! - Make `RECORD_REPLAY_ENABLE_ASSERTS` environment forwardable to the browser process
