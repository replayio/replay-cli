# Replay CLI

The Replay CLI provides packages for interacting with Replay to record, manage, and upload replays, as well as upload sourcemaps.

To use Replay with a Desktop Browser, visit [replay.io](https://www.replay.io/) to download and install.

## Packages

- [`/replayio`](./packages/replayio/README.md) CLI for viewing and uploading recordings
- [`/cypress`](./packages/cypress/README.md) Beta Plugin for recording and capturing metadata for Cypress tests.
- [`/playwright`](./packages/playwright/README.md) Beta Plugin for recording and capturing metadata for Playwright tests.
- [`/puppeteer`](./packages/puppeteer/README.md) Experimental Plugin for recording Puppeteer tests.
- [`/node`](./packages/node/README.md) Experimental CLI for recording Node.
- [`/sourcemap-upload`](./packages/sourcemap-upload/README.md) CLI for uploading sourcemaps to Replay servers to use when viewing replays.
- [`/sourcemap-upload-webpack-plugin`](./packages/sourcemap-upload-webpack-plugin/README.md) Webpack plugin for `sourcemap-upload`

## Developing

1. `yarn`
2. `yarn run build`

That should create an installed version of the package in `dist` within each directory in `packages`.

## Testing

You can run the unit tests for all of the packages with `yarn test`. You can run the unit tests for any individual package with `yarn run test` within that package.

## Deploying

1. Create changeset files in all PRs affecting the release artifacts by calling `yarn changeset`
2. Once the release is ready merge the currently open Version Packages PR
