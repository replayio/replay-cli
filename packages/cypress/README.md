# `@replayio/cypress`

Plugin to record your [Cypress](https://cypress.io) tests with [Replay](https://replay.io)

## Installation

`npm i @replayio/cypress`

## Usage

```js
// cypress.config.js
import { defineConfig } from "cypress";
import cypressReplay from "@replayio/cypress";

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // Adds "Replay Firefox" (macOS, linux) and "Replay Chromium" (linux)
      // browsers and hooks into Cypress lifecycle methods to capture test
      // metadata and results
      cypressReplay(on, config);
    }
  }
});
```

## Runtime Configuration

* If using the Firefox version of Replay, you must set the `RECORD_ALL_CONTENT` environment variable to enable recording.
* To enable capturing metadata for the tests, you must set `RECORD_REPLAY_METADATA_FILE` to an accessible file path.
* To hide the Cypress sidebar and only show your application, set `CYPRESS_NO_COMMAND_LOG`.

```bash
RECORD_ALL_CONTENT=1 \
RECORD_REPLAY_METADATA_FILE=$(mktemp) \
CYPRESS_NO_COMMAND_LOG=1 \
npx cypress run --browser "Replay Firefox"
```