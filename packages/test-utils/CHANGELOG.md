# @replayio/test-utils

## 3.0.4

### Patch Changes

- Updated dependencies []:
  - @replayio/replay@0.22.9

## 3.0.3

### Patch Changes

- [#554](https://github.com/replayio/replay-cli/pull/554) [`f1e815a`](https://github.com/replayio/replay-cli/commit/f1e815a) Thanks [@miriambudayr](https://github.com/miriambudayr)! - Added info and error log calls

- Updated dependencies []:
  - @replayio/replay@0.22.8

## 3.0.2

### Patch Changes

- [#533](https://github.com/replayio/replay-cli/pull/533) [`88f8122`](https://github.com/replayio/replay-cli/commit/88f8122) Thanks [@miriambudayr](https://github.com/miriambudayr)! - Added a logger that uses Grafana.

## 3.0.1

### Patch Changes

- [#540](https://github.com/replayio/replay-cli/pull/540) [`a6f8f10`](https://github.com/replayio/replay-cli/commit/a6f8f105654b39c5c457dfac91c5169f0ba6cc04) Thanks [@Andarist](https://github.com/Andarist)! - Avoid reporting duplicated API errors

## 3.0.0

### Major Changes

- [#536](https://github.com/replayio/replay-cli/pull/536) [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c) Thanks [@Andarist](https://github.com/Andarist)! - Breaking changes in the reporter's public API

- [#536](https://github.com/replayio/replay-cli/pull/536) [`8343abe`](https://github.com/replayio/replay-cli/commit/8343abe8f74fc67ef4fd374d943b73fdcead5a5c) Thanks [@Andarist](https://github.com/Andarist)! - Bumped the minimum supported node version to 18

### Minor Changes

- [#513](https://github.com/replayio/replay-cli/pull/513) [`d56ebda`](https://github.com/replayio/replay-cli/commit/d56ebda0a761ee6cf531a1e86d0fa99f7f192df5) Thanks [@Andarist](https://github.com/Andarist)! - Use the current branch name as the default run title in non-CI runs

### Patch Changes

- [#519](https://github.com/replayio/replay-cli/pull/519) [`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170) Thanks [@Andarist](https://github.com/Andarist)! - Added new `upload` options:

  - `statusThreshold`: this accepts one of `'all'`, `'failed-and-flaky'` or `'failed'` and it's used to skip uploading recordings for test runs that don't satisfy the desired threshold (eg. it allows to filter out recordings of passed tests)
  - `minimizeUploads`: a boolean flag that helps to minimize the amount of uploaded recordings. With this flag a minimal set of recordings associated with a retried test is uploaded

- Updated dependencies [[`34b1ba7`](https://github.com/replayio/replay-cli/commit/34b1ba705d5c6918333482707b5232fc8edf6170)]:
  - @replayio/replay@0.22.7

## 2.1.2

### Patch Changes

- [#516](https://github.com/replayio/replay-cli/pull/516) [`c27e2af`](https://github.com/replayio/replay-cli/commit/c27e2afa983dab6668c90a7b4704ef42f4836ec7) Thanks [@Andarist](https://github.com/Andarist)! - Fixed a race condition that could cause some tests not being added correctly to a test run

- Updated dependencies []:
  - @replayio/replay@0.22.6
