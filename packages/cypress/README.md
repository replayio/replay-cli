# `@replayio/cypress`

Plugin to record your [Cypress](https://cypress.io) tests with [Replay](https://replay.io)

**Check out the ["Recording Automated Tests Guide"](https://docs.replay.io/docs/recording-automated-tests-5bf7d91b65cd46deab1867b07bd12bdf) to get started.**

Use with [action-cypress](https://github.com/replayio/action-cypress) to automatically upload replays of failed tests.

## Installation

`npm i @replayio/cypress`

## Configuration

The Replay adapter for cypress requires two updates: one to your `cypress.config.js` and one to your support file in `cypress/e2e/support.js`.

```js
// cypress.config.js
import { defineConfig } from "cypress";
import cypressReplay, { wrapOn } from "@replayio/cypress";

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(cyOn, config) {
      const on = wrapOn(cyOn);
      // Adds replay-chromium browsers
      // and hooks into Cypress lifecycle methods to capture test
      // metadata and results
      cypressReplay(on, config);
      return config;
    },
  },
});
```

```js
// cypress/e2e/support.js

import "@replayio/cypress/support";
```

## Runtime Configuration

- Use the `--browser` flag to select the Replay Chromium to record
- To enable capturing metadata for the tests, you must set `RECORD_REPLAY_METADATA_FILE` to an accessible file path.
- To hide the Cypress sidebar and only show your application, set `CYPRESS_NO_COMMAND_LOG`.

```bash
RECORD_REPLAY_METADATA_FILE=$(mktemp) \
npx cypress run --browser replay-chromium
```

## Parallel runs on CI

If you have a large test suite, you might choose to split your test suite up and run them in parallel across multiple machines but still treat them as a single suite. By default, `@replayio/cypress` will generate a UUID for the suite and store it in the recording metadata under `test.run.id` but in this case each machine will have its own id.

In order to link these independently ran tests together, you can generate your own UUID and set it in the `RECORD_REPLAY_TEST_RUN_ID` environment variable and it will be used instead of generating a value.
