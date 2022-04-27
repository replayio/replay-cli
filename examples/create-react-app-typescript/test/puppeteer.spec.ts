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