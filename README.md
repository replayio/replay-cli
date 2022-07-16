# Replay CLI

The Replay CLI provides packages for interacting with Replay to record, manage, and upload replays, as well as upload sourcemaps.

To use Replay with a Desktop Browser, visit [replay.io](https://www.replay.io/) to download and install.

## Packages

- [`/replay`](./packages/replay/README.md) CLI for viewing + uploading recordings
- [`/cypress`](./packages/cypress/README.md) Beta Plugin for recording and capturing metadata for Cypress tests.
- [`/playwright`](./packages/playwright/README.md) Beta Plugin for recording and capturing metadata for Playwright tests.
- [`/puppeteer`](./packages/puppeteer/README.md) Experimental Plugin for recording Puppeteer tests.
- [`/node`](./packages/node/README.md) Experimental CLI for recording Node.
- [`/sourcemap-upload`](./packages/sourcemap-upload/README.md) CLI for uploading sourcemaps to Replay servers to use when viewing replays.
- [`/sourcemap-upload-webpack-plugin`](./packages/sourcemap-upload-webpack-plugin/README.md) Webpack plugin for `sourcemap-upload`

## Developing

### Build

Prerequisites:

- Node.js >=16.10

Steps:

1. `corepack enable`
2. `yarn install`

### Test

`yarn unit:test`
