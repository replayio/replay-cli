# @replayio/playwright

Plugin to record your [Playwright](https://playwright.dev) tests with [Replay](https://replay.io).

**Check out the ["Recording Automated Tests Guide"](https://docs.replay.io/docs/recording-automated-tests-5bf7d91b65cd46deab1867b07bd12bdf) to get started.**

Use with [action-playwright](https://github.com/Replayio/action-playwright) to automatically upload replays of failed tests.

## Installation

`npm i -D @replayio/playwright`

## Configuration

```js
import { PlaywrightTestConfig, devices } from "@playwright/test";
import { devices as replayDevices } from "@replayio/playwright";


const config: PlaywrightTestConfig = {
  projects: [
    {
      name: "replay-chromium",
      use: { ...replayDevices["Replay Chromium"] as any },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chromium"] },
    },
  ],
};
export default config;
```

### Runtime Configuration

- Use the `--project` flag to select a project and specified Replay Browser to record.
- To capture and report metadata, use `--reporter=@replayio/playwright/reporter,line`

```bash
npx playwright test
--project replay-chromium
--reporter=@replayio/playwright/reporter,line
```

### Exports

- `devices` - Object of configurations suitable for using with `@playwright/test`. Currently only supports the `"Replay Chromium"` configuration. If the configuration isn't supported on the current platform, a warning is emitted and the `executablePath` will be undefined.
- `getExecutablePath(browserName: string)` - Returns the path to the Replay Browser for the given `browserName`: either `"chromium"`. If `browserName` isn't supported on the current platform, `undefined` is returned.
- `getMetadataFilePath(workerIndex: number = 0)` - Returns the path of a worker-specific metadata file keyed by the `workerIndex`. The file path will be within the `RECORD_REPLAY_DIRECTORY`.

## Parallel runs on CI

If you have a large test suite, you might choose to split your test suite up and run them in parallel across multiple machines but still treat them as a single suite. By default, `@replayio/playwright` will generate a UUID for the suite and store it in the recording metadata under `test.run.id` but in this case each machine will have its own id.

In order to link these independently ran tests together, you can generate your own UUID and set it in the `RECORD_REPLAY_TEST_RUN_ID` environment variable and it will be used instead of generating a value.
