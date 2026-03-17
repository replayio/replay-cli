#!/usr/bin/env node

// CDP Protocol Adapter
// Makes replay-chrome (Chrome 108) compatible with tools expecting Chrome 131+

"use strict";

const { spawn } = require("child_process");
const net = require("net");
const http = require("http");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let replayChromeBin = null;
const chromeArgs = [];

for (const arg of args) {
  if (arg.startsWith("--replay-chrome-bin=")) {
    replayChromeBin = arg.slice("--replay-chrome-bin=".length);
  } else {
    chromeArgs.push(arg);
  }
}

if (!replayChromeBin) {
  process.stderr.write("Error: --replay-chrome-bin argument is required\n");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CDP Protocol Adapter
// ---------------------------------------------------------------------------

// Domains that don't exist in Chrome 108
const MISSING_DOMAINS = new Set([
  "Extensions",
  "Autofill",
  "FedCm",
  "PWA",
  "Preload",
  "DeviceAccess",
  "BluetoothEmulation",
  "FileSystem",
]);

// Parameters to strip per-method (Chrome 108 doesn't know about these)
const PARAM_STRIPS = {
  "Page.addScriptToEvaluateOnNewDocument": ["runImmediately"],
  "Target.createTarget": ["forTab", "hidden", "focus"],
  "Emulation.setDeviceMetricsOverride": ["displayFeature"],
  "Target.exposeDevToolsProtocol": ["inheritPermissions"],
  "Browser.setPermission": ["embeddedOrigin"],
};

const SPOOFED_VERSION = "Chrome/131.0.6778.264";

class CDPAdapter {
  constructor() {
    // Track pending request methods by message id for response transformation
    this.pendingMethods = new Map();
  }

  // Puppeteer -> Chrome
  transformRequest(msg) {
    const { method, id, params } = msg;
    if (!method) return { msg };

    if (id !== undefined) {
      this.pendingMethods.set(id, method);
    }

    // Stub missing domains
    const domain = method.split(".")[0];
    if (MISSING_DOMAINS.has(domain)) {
      return {
        reply: {
          id,
          error: { code: -32601, message: `'${method}' wasn't found` },
        },
      };
    }

    // Strip parameters Chrome 108 doesn't understand
    if (params) {
      const strip = PARAM_STRIPS[method];
      if (strip) {
        for (const key of strip) {
          delete params[key];
        }
      }
    }

    return { msg };
  }

  // Chrome -> Puppeteer
  transformResponse(msg) {
    if (msg.id !== undefined && this.pendingMethods.has(msg.id)) {
      const method = this.pendingMethods.get(msg.id);
      this.pendingMethods.delete(msg.id);

      // Spoof browser version
      if (method === "Browser.getVersion" && msg.result && msg.result.product) {
        msg.result.product = msg.result.product.replace(
          /Chrome\/[\d.]+/,
          SPOOFED_VERSION
        );
      }
    }

    return { msg };
  }
}

// ---------------------------------------------------------------------------
// Pipe-mode proxy (FD 3/4 <-> FD 3/4)
// ---------------------------------------------------------------------------

function startPipeMode() {
  const adapter = new CDPAdapter();

  const chrome = spawn(replayChromeBin, chromeArgs, {
    stdio: ["inherit", "pipe", "pipe", "pipe", "pipe"],
  });

  chrome.stdout.pipe(process.stdout);
  chrome.stderr.pipe(process.stderr);

  // Our FD 3 = readable (Puppeteer writes here)
  // Our FD 4 = writable (Puppeteer reads from here)
  const fromPuppeteer = new net.Socket({ fd: 3, readable: true, writable: false });
  const toPuppeteer = new net.Socket({ fd: 4, readable: false, writable: true });

  // Chrome's stdio[3] = writable (we write commands to Chrome)
  // Chrome's stdio[4] = readable (Chrome writes responses to us)
  const toChrome = chrome.stdio[3];
  const fromChrome = chrome.stdio[4];

  relayPipe(fromPuppeteer, toChrome, toPuppeteer, (msg) =>
    adapter.transformRequest(msg)
  );
  relayPipe(fromChrome, toPuppeteer, null, (msg) =>
    adapter.transformResponse(msg)
  );

  chrome.on("exit", (code) => process.exit(code ?? 1));
  process.on("SIGTERM", () => chrome.kill("SIGTERM"));
  process.on("SIGINT", () => chrome.kill("SIGINT"));
}

// Relay null-delimited JSON messages between pipe endpoints
function relayPipe(readable, writable, replyWritable, transform) {
  let buffer = "";
  readable.setEncoding("utf8");
  readable.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\0")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!raw) continue;

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        writable.write(raw + "\0");
        continue;
      }

      const result = transform(msg);
      if (result.reply && replyWritable) {
        replyWritable.write(JSON.stringify(result.reply) + "\0");
      } else if (result.msg) {
        writable.write(JSON.stringify(result.msg) + "\0");
      }
    }
  });
}

// ---------------------------------------------------------------------------
// WebSocket-mode proxy
// ---------------------------------------------------------------------------

async function startWsMode() {
  let ws;
  try {
    ws = require("ws");
  } catch {
    process.stderr.write(
      "Error: ws module required for WebSocket mode. Install with: npm install ws\n"
    );
    process.exit(1);
  }

  const WebSocketClient = ws.WebSocket || ws;
  const WebSocketServer = ws.WebSocketServer || ws.Server;
  const adapter = new CDPAdapter();

  // Extract the requested debug port from args
  let requestedPort = 0;
  const filteredArgs = chromeArgs.filter((arg) => {
    const match = arg.match(/^--remote-debugging-port=(\d+)$/);
    if (match) {
      requestedPort = parseInt(match[1], 10);
      return false;
    }
    return true;
  });

  // Launch Chrome with its own auto-assigned debug port
  const chrome = spawn(
    replayChromeBin,
    [...filteredArgs, "--remote-debugging-port=0"],
    { stdio: ["inherit", "pipe", "pipe"] }
  );
  chrome.stdout.pipe(process.stdout);

  // Capture Chrome's WS URL from stderr
  const chromeWsUrl = await new Promise((resolve, reject) => {
    let captured = false;

    chrome.stderr.on("data", (chunk) => {
      if (captured) {
        process.stderr.write(chunk);
        return;
      }
      const text = chunk.toString();
      const match = text.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        captured = true;
        resolve(match[1]);
      } else {
        // Forward non-endpoint stderr immediately
        process.stderr.write(chunk);
      }
    });

    chrome.on("exit", (code) => {
      if (!captured)
        reject(new Error(`Chrome exited with code ${code} before providing WS URL`));
    });
    setTimeout(() => {
      if (!captured) reject(new Error("Timeout waiting for Chrome WS endpoint"));
    }, 30000);
  });

  const chromeUrl = new URL(chromeWsUrl);
  const chromeHost = chromeUrl.hostname;
  const chromePort = parseInt(chromeUrl.port, 10);

  // Start our proxy HTTP + WS server
  let proxyPort;

  const server = http.createServer((req, res) => {
    // Proxy HTTP requests (e.g. /json/version, /json/list) to Chrome
    const proxyReq = http.request(
      {
        hostname: chromeHost,
        port: chromePort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        let body = "";
        proxyRes.on("data", (d) => (body += d));
        proxyRes.on("end", () => {
          try {
            const data = JSON.parse(body);
            rewriteDiscoveryResponse(data, chromePort, proxyPort);
            body = JSON.stringify(data);
          } catch {
            // non-JSON response, forward as-is
          }
          res.writeHead(proxyRes.statusCode, {
            "content-type": "application/json",
          });
          res.end(body);
        });
      }
    );
    proxyReq.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxyReq);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (puppeteerWs, req) => {
    const targetUrl = `ws://${chromeHost}:${chromePort}${req.url}`;
    const chromeWs = new WebSocketClient(targetUrl);

    // Buffer messages until Chrome WS is open
    const buffered = [];

    puppeteerWs.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendToChrome(data);
        return;
      }

      const result = adapter.transformRequest(msg);
      if (result.reply) {
        puppeteerWs.send(JSON.stringify(result.reply));
      } else if (result.msg) {
        sendToChrome(JSON.stringify(result.msg));
      }
    });

    function sendToChrome(data) {
      if (chromeWs.readyState === WebSocketClient.OPEN) {
        chromeWs.send(data);
      } else {
        buffered.push(data);
      }
    }

    chromeWs.on("open", () => {
      for (const d of buffered) chromeWs.send(d);
      buffered.length = 0;
    });

    chromeWs.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        puppeteerWs.send(data);
        return;
      }
      const result = adapter.transformResponse(msg);
      if (result.msg) {
        puppeteerWs.send(JSON.stringify(result.msg));
      }
    });

    puppeteerWs.on("close", () => safeClose(chromeWs));
    chromeWs.on("close", () => safeClose(puppeteerWs));
    chromeWs.on("error", () => safeClose(puppeteerWs));
    puppeteerWs.on("error", () => safeClose(chromeWs));
  });

  proxyPort = await new Promise((resolve) => {
    server.listen(requestedPort, "127.0.0.1", () =>
      resolve(server.address().port)
    );
  });

  // Output our proxy WS URL so Puppeteer discovers it
  const proxyWsUrl = chromeWsUrl.replace(`:${chromePort}`, `:${proxyPort}`);
  process.stderr.write(`DevTools listening on ${proxyWsUrl}\n`);

  chrome.on("exit", (code) => {
    server.close();
    process.exit(code ?? 1);
  });
  process.on("SIGTERM", () => {
    chrome.kill("SIGTERM");
    server.close();
  });
  process.on("SIGINT", () => {
    chrome.kill("SIGINT");
    server.close();
  });
}

// Rewrite port numbers and version strings in HTTP discovery responses
function rewriteDiscoveryResponse(data, chromePort, proxyPort) {
  if (Array.isArray(data)) {
    for (const item of data) rewriteDiscoveryResponse(item, chromePort, proxyPort);
    return;
  }
  if (!data || typeof data !== "object") return;

  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "string") continue;
    if (value.includes(`:${chromePort}`)) {
      data[key] = value.replace(new RegExp(`:${chromePort}`, "g"), `:${proxyPort}`);
    }
    if (key === "Browser" || key === "product") {
      data[key] = data[key].replace(/Chrome\/[\d.]+/, SPOOFED_VERSION);
    }
  }
}

function safeClose(ws) {
  try {
    ws.close();
  } catch {}
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isPipe = chromeArgs.includes("--remote-debugging-pipe");

if (isPipe) {
  startPipeMode();
} else {
  startWsMode().catch((err) => {
    process.stderr.write(`Adapter error: ${err.message}\n`);
    process.exit(1);
  });
}
