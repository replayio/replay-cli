# `@recordreplay/cypress-replay`

Plugin to record your [Cypress](https://cypress.io) tests with [Replay](https://replay.io)

## Installation

`npm i @recordreplay/cypress-replay`

## Configuration

Replay can be configured to upload `"all"`, `"none"`, or only `"failed"` recordings of each spec using your `cypress.json` configuration file.

```json
{
  "env": {
    "replay": {
      "upload": "failed"
    }
  }
}
```

## Usage

```js
// cypress.config.js
import { defineConfig } from "cypress";
import cypressReplay from "@replayio/cypress";

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      cypressREplay(on, config);
    }
  }
});
```
