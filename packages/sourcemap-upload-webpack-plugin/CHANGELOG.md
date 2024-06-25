# @replayio/sourcemap-upload-webpack-plugin

## 2.0.3

### Patch Changes

- [#549](https://github.com/replayio/replay-cli/pull/549) [`ac7aa52`](https://github.com/replayio/replay-cli/commit/ac7aa52) Thanks [@Andarist](https://github.com/Andarist)! - Fixed the generated `.js` output to correctly reference `glob` package

- Updated dependencies [[`e7bd234`](https://github.com/replayio/replay-cli/commit/e7bd234980e9dfc7ab9584d47ebaf1812712f291)]:
  - @replayio/sourcemap-upload@2.0.6

## 2.0.2

### Patch Changes

- [#556](https://github.com/replayio/replay-cli/pull/556) [`89c5082`](https://github.com/replayio/replay-cli/commit/89c5082a06265255ffdc8b4f1e87dcb1d3d9c2d2) Thanks [@markerikson](https://github.com/markerikson)! - Updated glob version to fix nested dependency deprecation warning

- Updated dependencies [[`89c5082`](https://github.com/replayio/replay-cli/commit/89c5082a06265255ffdc8b4f1e87dcb1d3d9c2d2)]:
  - @replayio/sourcemap-upload@2.0.5

## 2.0.1

### Patch Changes

- [#518](https://github.com/replayio/replay-cli/pull/518) [`75d475a`](https://github.com/replayio/replay-cli/commit/75d475ad5aed0c331cfc3b36bdcd8e7822b58c39) Thanks [@markerikson](https://github.com/markerikson)! - Add support for deleting sourcemaps after they are uploaded, and correlating sourcemaps by filename + `.map` extension if no `sourceMappingURL` exists in the generated file.

- Updated dependencies [[`75d475a`](https://github.com/replayio/replay-cli/commit/75d475ad5aed0c331cfc3b36bdcd8e7822b58c39)]:
  - @replayio/sourcemap-upload@2.0.4
