import { test, expect } from "@playwright/test";
import { listAllRecordings, uploadRecording } from "@replayio/replay";
import { env } from "process";

const replayResults: { [key: string]: number } = {};

const replayTest = test.extend({
  replay: ({}, use) => {
    use({ replay: replayResults });
  },
});

replayTest.afterEach(({ replay }, testInfo) => {
  const last = listAllRecordings().pop();
  console.log({ last });
  if (last) {
    replayResults[testInfo.title] = last.id;
  }
});

replayTest.afterAll(({ replay }) => {
  console.log(replay);
  Object.entries(replayResults).forEach(async ([title, id]) => {
    console.log(`Uploading ${title} as recording ${id}`);
    try {
      console.log(
        `Upload result: ${await uploadRecording(id, {
          verbose: true,
          apiKey: process.env.RECORD_REPLAY_API_KEY,
        })}`
      );
    } catch (e) {
      console.log({ error: e });
    }
  });
});

replayTest("basic test", async ({ page }) => {
  await page.goto("http://localhost:3000/");
  const title = page.locator(".App");
  await expect(title).toHaveText("Edit src/App.tsx and save to reload.");
});
