#!/usr/bin/env node

// Test suite for the CDP adapter.
//
// Usage:
//   node test.js direct   – connect Puppeteer v24 to replay-chrome directly
//   node test.js adapter  – connect through the CDP adapter wrapper
//
// In "direct" mode the browser launch itself fails, demonstrating that
// replay-chrome (Chrome 108) isn't compatible with Puppeteer v24's
// Target.setAutoAttach initialization sequence.
// In "adapter" mode all tests should pass.

"use strict";

const puppeteer = require("puppeteer-core");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

// ---------------------------------------------------------------------------
// Browser path helpers
// ---------------------------------------------------------------------------

function getDirectBrowserPath() {
  const base = process.env.RECORD_REPLAY_DIRECTORY || path.join(os.homedir(), ".replay");
  if (process.platform === "darwin") {
    return path.join(base, "runtimes", "Replay-Chromium.app", "Contents", "MacOS", "Chromium");
  }
  return path.join(base, "runtimes", "chrome-linux", "chrome");
}

function getAdapterBrowserPath() {
  const cli = path.resolve(__dirname, "..", "..", "packages", "replayio", "bin.js");
  const raw = execSync(`node "${cli}" get-adapter-browser 131`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  // The CLI may print spinner text before the path; take the last non-empty line
  const lines = raw.trim().split("\n").filter(Boolean);
  return lines[lines.length - 1].trim();
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

const tests = [
  {
    name: "Browser version reports Chrome 131+",
    run: async (browser) => {
      const version = await browser.version();
      if (!/Chrome\/131\./.test(version)) {
        throw new Error(`Expected Chrome/131.x, got: ${version}`);
      }
    },
  },
  {
    name: "Can create a new page",
    run: async (browser) => {
      const page = await browser.newPage();
      if (!page) throw new Error("newPage() returned falsy");
      await page.close();
    },
  },
  {
    name: "Can navigate to a data URL and read content",
    run: async (browser) => {
      const page = await browser.newPage();
      await page.goto("data:text/html,<h1>Hello from Replay</h1>");
      const text = await page.evaluate(
        () => document.querySelector("h1").textContent
      );
      if (text !== "Hello from Replay") {
        throw new Error(`Expected 'Hello from Replay', got '${text}'`);
      }
      await page.close();
    },
  },
  {
    name: "Can evaluate JavaScript expressions",
    run: async (browser) => {
      const page = await browser.newPage();
      const result = await page.evaluate(() => 2 + 2);
      if (result !== 4) throw new Error(`Expected 4, got ${result}`);
      await page.close();
    },
  },
  {
    name: "Can take a screenshot",
    run: async (browser) => {
      const page = await browser.newPage();
      await page.goto("data:text/html,<h1>Screenshot</h1>");
      const buf = await page.screenshot();
      if (!buf || buf.length === 0) throw new Error("Screenshot is empty");
      await page.close();
    },
  },
  {
    name: "Can set viewport size",
    run: async (browser) => {
      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 600 });
      const dims = await page.evaluate(() => ({
        w: window.innerWidth,
        h: window.innerHeight,
      }));
      if (dims.w !== 800 || dims.h !== 600) {
        throw new Error(`Expected 800x600, got ${dims.w}x${dims.h}`);
      }
      await page.close();
    },
  },
  {
    name: "Can intercept network requests",
    run: async (browser) => {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      let intercepted = false;
      page.on("request", (req) => {
        intercepted = true;
        req.continue();
      });
      await page.goto("data:text/html,<p>intercepted</p>");
      if (!intercepted) throw new Error("No request was intercepted");
      await page.close();
    },
  },
  {
    name: "Can add script to evaluate on new document",
    run: async (browser) => {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        window.__injected = true;
      });
      await page.goto("data:text/html,<p>test</p>");
      const injected = await page.evaluate(() => window.__injected);
      if (injected !== true) {
        throw new Error(`Expected __injected=true, got ${injected}`);
      }
      await page.close();
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run() {
  const mode = process.argv[2];
  if (mode !== "direct" && mode !== "adapter") {
    console.error("Usage: node test.js <direct|adapter>");
    process.exit(1);
  }

  const executablePath =
    mode === "adapter" ? getAdapterBrowserPath() : getDirectBrowserPath();

  console.log(`\nMode:    ${mode}`);
  console.log(`Browser: ${executablePath}\n`);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-first-run",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-default-apps",
        "--no-sandbox",
      ],
      timeout: 15000,
    });
  } catch (err) {
    // In direct mode, the launch itself fails because Chrome 108's
    // Target.setAutoAttach doesn't auto-attach existing targets.
    console.log(`  FAIL  Browser launch`);
    console.log(`        ${err.message}`);
    console.log(`\nResults: 0 passed, 1 failed (launch failure)\n`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.run(browser);
      console.log(`  PASS  ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  FAIL  ${t.name}`);
      console.log(`        ${err.message}`);
      failed++;
    }
  }

  try {
    await browser.close();
  } catch {}

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(2);
});
