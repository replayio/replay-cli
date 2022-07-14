# @replayio/puppeteer

Provides utilities to support using [Replay](https://replay.io) with [Puppeteer](https://pptr.dev)

Use with [replayio/action-upload](https://github.com/Replayio/action-upload) to automatically upload replays of puppeteer scripts. [Check out our documentation here.](https://docs.replay.io/docs/recording-puppeteer-5525cfad405e41a18b940af3d09d68be#5525cfad405e41a18b940af3d09d68be)

Exports

- `getExecutablePath()` - Returns the path to the replay chromium browser.
- `getMetadataFilePath(workerIndex: number = 0)` - Returns the path of a worker-specific metadata file keyed by the `workerIndex`. The file path will be within the `RECORD_REPLAY_DIRECTORY`.

### Metadata

You can add metadata to your puppeteer recordings using either the `RECORD_REPLAY_METADATA` or `RECORD_REPLAY_METADATA_FILE` environment variable. If both are set, `RECORD_REPLAY_METADATA_FILE` takes precedence.

> Currently, this metadata is only available locally except for `title`

- `RECORD_REPLAY_METADATA_FILE` - The path to a file containing JSON-formatted metadata
- `RECORD_REPLAY_METADATA` - JSON-formatted metadata string

```js
const puppeteer = require("puppeteer");
const { getExecutablePath } = require("@replayio/puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: getExecutablePath(),
  });
  const page = await browser.newPage();
  await page.goto("https://replay.io");
  await page.screenshot({ path: "replay.png" });

  await page.close();
  await browser.close();
})();
```
