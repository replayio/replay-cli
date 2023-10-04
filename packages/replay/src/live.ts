import dbg from "debug";
import path from "path";
import * as playwright from 'playwright';

import { ensureBrowsersInstalled, getExecutablePath, } from "./install";
import { getDirectory, getServer } from "./utils";

import { BrowserName } from "./types";

import { readToken } from "./auth";
import { queryHasura, query } from "./graphql"


import 'dotenv/config'

export type { BrowserName, RecordingEntry } from "./types";

const debug = dbg("replay:cli");


async function getRecentRecordings(userId: string, timestamp: string) {
  const res = await queryHasura(
    'recordings',
    `
      query myRecordings($date: timestamptz!, $userId: uuid!) {
        recordings(order_by: {date: asc}, limit: 5, where: {date: {_gte:$date}, user_id: {_eq: $userId}}) {
          id,
          date,
        }
      }`,
    {
      date: timestamp,
      userId
    })

  return res.data.recordings
}

async function getUserId(apiKey: string | undefined) {
  try {
    const res = await query(`user`,
      `query GetUserId {
          viewer {
            user {
              id
            }
          }
        }
      `, {}, apiKey)

    const userId = atob(res.data.viewer.user.id).slice(2,)
    return userId
  } catch (e) {
    debug("Could not fetch user id")
    return null;
  }
}

async function updateMetadata(id: string, url: string) {
  try {
    const host = new URL(url).hostname
    const res = await queryHasura('updateMetadata',
      `mutation UpdateRecordingMetadata($id: uuid!, $title: String!) {
      update_recordings(where: {id: {_eq: $id}}, _set: {title: $title}) {
        returning {
          id
        }
      }
    }
    `,
      {
        id,
        title: host
      }
    )
    return res
  } catch (e) {
    debug('Could not set recording metadata')
    return null;
  }
}

export async function launchLiveBrowser(browserName: BrowserName,
  args: string[] = [],
  attach: boolean = false
) {
  const execPath = getExecutablePath(browserName);
  if (!execPath) {
    throw new Error(`${browserName} not supported on the current platform`);
  }
  await ensureBrowsersInstalled(browserName, false);

  const profileDir = path.join(getDirectory(), "runtimes", "profiles", browserName);
  const apiKey = await readToken();
  const server = getServer();

  const envVariables = {
    RECORD_REPLAY_SERVER: server || "",
    RECORD_REPLAY_API_KEY: apiKey || "",
  };

  if (!apiKey) {
    console.warn("You need to first login `replay login` before launching the browser.")
    return;
  }

  const userId = await getUserId(apiKey);
  if (!userId) {
    console.warn("You need to first login `replay login` before launching the browser.")
    return;
  }

  // Launch the browser with the replay binary, our user profile, and environment variables
  const browser = await playwright[browserName].launchPersistentContext(profileDir, {
    executablePath: execPath,
    headless: false,
    env: envVariables
  });

  const registerPageHandlers = async (page: playwright.Page) => {
    const timestamp = new Date().toISOString();
    let url = await page.url();
    let crashed = false

    page.on('framenavigated', async frame => {
      if (frame === page.mainFrame()) {
        url = await page.url()
      }
    });

    page.on('crash', async () => {
      console.log('Page crashed! Create a new tab');
      crashed = true
    });

    page.on("close", async () => {
      if (crashed) {
        return;
      }

      const recordings = await getRecentRecordings(userId, timestamp)

      const likelyRecording = recordings.length == 1 ? recordings[0] : recordings[2];
      if (!likelyRecording) {
        console.warn("Could not find a recording")
        return
      }

      const recordingId = likelyRecording.id
      await updateMetadata(recordingId, url)
      console.log(`https://app.replay.io/recording/${recordingId}`)
    })
  }

  const pages = await browser.pages();
  registerPageHandlers(pages[pages.length - 1])
  browser.on('page', (page) => registerPageHandlers(page))

  // Keep the browser open until a later point when we want to close it
  await new Promise(r => { })
}
