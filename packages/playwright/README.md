# @replayio/playwright

Provides utilities to support using [Replay](https://replay.io) with [Playwright](https://playwright.dev)

## Installation

`npm i @replayio/playwright`

## Usage

Use with [replayio/action-playwright](https://github.com/Replayio/action-playwright) to automatically upload replays of failed tests. [Check out our documentation here.](https://docs.replay.io/docs/recording-playwright-b62474b5aadd49e2b0c44a7580b0617e#4f9d9bb360974bf7942f8edae8dcd742)

### Exports

- `getExecutablePath(browserName: string)` - Returns the path to the replay browser for the given `browserName`: either `"chromium"` or `"firefox"`. If `browserName` isn't supported on the current platform, `undefined` is returned.
- `devices` - Object of configurations suitable for using with `@playwright/test`. Currently supports `"Replay Firefox"` and `"Replay Chromium"` configurations. If the configuration isn't supported on the current platform, a warning is emitted and the `executablePath` will be undefined.
- `getMetadataFilePath(workerIndex: number = 0)` - Returns the path of a worker-specific metadata file keyed by the `workerIndex`. The file path will be within the `RECORD_REPLAY_DIRECTORY`.

### Using standalone

If you are using `playwright` (rather than `@replayio/playwright`), you can configure it to use the Replay browser by passing in the `executablePath` to `launch()`.

> **Note:** For `firefox`, you must also pass the `RECORD_ALL_CONTENT` environment variable to start recording. This is not required for `chromium` which records all content by default.`

### Metadata

You can add metadata to your playwright recordings using either the `RECORD_REPLAY_METADATA` or `RECORD_REPLAY_METADATA_FILE` environment variable. If both are set, `RECORD_REPLAY_METADATA_FILE` takes precedence.

> Currently, this metadata is only available locally except for `title`

- `RECORD_REPLAY_METADATA_FILE` - The path to a file containing JSON-formatted metadata
- `RECORD_REPLAY_METADATA` - JSON-formatted metadata string

```js
const playwright = require("playwright");
const { getExecutablePath } = require("@replayio/playwright");

(async () => {
  const browser = await playwright.firefox.launch({
    headless: false,
    executablePath: getExecutablePath("firefox"),
    env: {
      RECORD_ALL_CONTENT: 1,
      RECORD_REPLAY_METADATA: JSON.stringify({
        title: "Screenshot of replay.io"
      })
    },
  });
  const page = await browser.newPage();
  await page.goto("https://replay.io");
  await page.screenshot({ path: "replay.png" });

  await page.close();
  await browser.close();
})();
```

### Using with `@playwright/test`

`@replayio/playwright` exports a `devices` object with configurations for both `"Replay Firefox"` and `"Replay Chromium"`. These can be added to your `playwright.config.js` to start recording your tests.

```js
// playwright.config.js
// @ts-check
const { devices } = require("@replayio/playwright");

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: "on-first-retry",
    defaultBrowserType: "firefox",
  },
  projects: [
    {
      name: "firefox",
      use: {
        ...devices["Replay Firefox"],
      },
    },
  ],
};

module.exports = config;
```

## Parallel runs on CI

If you have a large test suite, you might choose to split your test suite up and run them in parallel across multiple machines but still treat them as a single suite. By default, `@replayio/playwright` will generate a UUID for the suite and store it in the recording metadata under `test.run.id` but in this case each machine will have its own id. In order to link these independently ran tests together, you can generate your own UUID and set it in the `RECORD_REPLAY_TEST_RUN_ID` environment variable and it will be used instead of generating a value.
