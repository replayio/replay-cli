# `@recordreplay/playwright-config`

Provides utilities to support using [Replay](https://replay.io) with [Playwright](https://playwright.dev)

Exports
* `getExecutablePath(browserName: string)` - Returns the path to the replay browser for the given `browserName`: either `"chromium"` or `"firefox"`. If `browserName` isn't supported on the current platform, `undefined` is returned.
* `devices` - Object of configurations suitable for using with `@playwright/test`. Currently supports `"Replay Firefox"` and `"Replay Chromium"` configurations. If the configuration isn't supported on the current platform, a warning is emitted and the `executablePath` will be undefined.

## Using standalone

If you are using `playwright` (rather than `@recordreplay/playwright`), you can configure it to use the Replay browser by passing in the `executablePath` to `launch()`.

> **Note:** For `firefox`, you must also pass the `RECORD_ALL_CONTENT` environment variable to start recording. This is not required for `chromium` which records all content by default.

```js
const playwright = require("playwright");
const { getExecutablePath } = require("@recordreplay/playwright-config");

(async () => {
	const browser = await playwright.firefox.launch({
		headless: false,
		executablePath: getExecutablePath("firefox"),
		env: {
			RECORD_ALL_CONTENT: 1,
		},
	});
	const page = await browser.newPage();
	await page.goto("https://replay.io");
	await page.screenshot({ path: "replay.png" });

	await page.close();
	await browser.close();
})();
```

## Using with `@playwright/test`

`@recordreplay/playwright-config` exports a `devices` object with configurations for both `"Replay Firefox"` and `"Replay Chromium"`. These can be added to your `playwright.config.js` to start recording your tests.

```js
// playwright.config.js
// @ts-check
const { devices } = require("@recordreplay/playwright-config");

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