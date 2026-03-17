#!/usr/bin/env node

// CDP Protocol Adapter
// Makes replay-chrome (Chrome 108) compatible with tools expecting Chrome 131+
//
// Key incompatibility: Chrome 108's Target.setAutoAttach only affects future
// targets. Chrome 131+ also attaches to existing targets. This adapter
// polyfills that behavior by manually attaching after setAutoAttach.

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

// Internal message IDs use a high range to avoid conflicts with Puppeteer's IDs
const INTERNAL_ID_BASE = 9000000;

class CDPAdapter {
  constructor() {
    // Track pending request methods by message id for response transformation
    this.pendingMethods = new Map();
    // Callbacks for adapter-internal CDP commands sent to Chrome
    this.internalCallbacks = new Map();
    this.nextInternalId = INTERNAL_ID_BASE;
    // Transport functions set by the proxy layer
    this._sendToChrome = null;
    this._sendToPuppeteer = null;
  }

  // Set transport functions so the adapter can send its own commands
  setTransport(sendToChrome, sendToPuppeteer) {
    this._sendToChrome = sendToChrome;
    this._sendToPuppeteer = sendToPuppeteer;
  }

  // Send an internal CDP command to Chrome and return the result
  _callChrome(method, params) {
    return new Promise((resolve) => {
      const id = this.nextInternalId++;
      this.internalCallbacks.set(id, resolve);
      this._sendToChrome({ id, method, params });
    });
  }

  // CDP target filter matching: returns true if target should be included.
  // Filters are processed in order; first matching entry wins.
  _matchesFilter(targetInfo, filters) {
    for (const filter of filters) {
      if (!filter.type || filter.type === targetInfo.type) {
        return !filter.exclude;
      }
    }
    return false; // no match = excluded
  }

  // Polyfill: after setAutoAttach, manually attach to existing targets that
  // match the filter (Chrome 108 only auto-attaches future targets).
  async _polyfillAutoAttach(filter) {
    if (!this._sendToChrome) return;

    const result = await this._callChrome("Target.getTargets", {});
    if (!result || !result.targetInfos) return;

    for (const target of result.targetInfos) {
      if (target.attached) continue;
      if (!this._matchesFilter(target, filter)) continue;

      await this._callChrome("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      });
    }
  }

  // Polyfill: after createTarget, check if the new target got auto-attached.
  // If not, manually attach it so Puppeteer can use it.
  async _polyfillNewTarget(targetId) {
    if (!this._sendToChrome) return;

    // Small delay to let Chrome's auto-attach run first
    await new Promise((r) => setTimeout(r, 100));

    const result = await this._callChrome("Target.getTargets", {});
    if (!result || !result.targetInfos) return;

    const target = result.targetInfos.find((t) => t.targetId === targetId);
    if (!target || target.attached) return;

    // Target wasn't auto-attached — manually attach it
    await this._callChrome("Target.attachToTarget", {
      targetId: targetId,
      flatten: true,
    });
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
    // Intercept responses to our internal commands — don't forward to Puppeteer
    if (msg.id !== undefined && msg.id >= INTERNAL_ID_BASE) {
      const cb = this.internalCallbacks.get(msg.id);
      if (cb) {
        this.internalCallbacks.delete(msg.id);
        cb(msg.result || msg.error);
      }
      return { drop: true };
    }

    if (msg.id !== undefined && this.pendingMethods.has(msg.id)) {
      const method = this.pendingMethods.get(msg.id);
      this.pendingMethods.delete(msg.id);

      // Polyfill: Chrome 108's setAutoAttach only affects future targets.
      // After each setAutoAttach succeeds, attach existing unattached targets.
      if (method === "Target.setAutoAttach" && msg.result) {
        const filter = this._lastAutoAttachFilter;
        if (filter) {
          this._polyfillAutoAttach(filter);
        }
      }

      // Polyfill: Chrome 108's createTarget doesn't auto-attach new pages
      // through tab sessions like Chrome 131+ does. Manually attach new targets.
      if (method === "Target.createTarget" && msg.result && msg.result.targetId) {
        this._polyfillNewTarget(msg.result.targetId);
      }

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

  // Called from transformRequest to save the filter before forwarding
  _trackAutoAttachFilter(params) {
    if (params && params.filter) {
      this._lastAutoAttachFilter = params.filter;
    }
  }
}

// Override transformRequest to also track the auto-attach filter
const _origTransformRequest = CDPAdapter.prototype.transformRequest;
CDPAdapter.prototype.transformRequest = function (msg) {
  if (msg.method === "Target.setAutoAttach") {
    this._trackAutoAttachFilter(msg.params);
  }
  return _origTransformRequest.call(this, msg);
};

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

  // Give adapter transport access for internal commands
  adapter.setTransport(
    (msg) => toChrome.write(JSON.stringify(msg) + "\0"),
    (msg) => toPuppeteer.write(JSON.stringify(msg) + "\0")
  );

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
      if (result.drop) {
        // Internal message consumed by adapter, don't forward
      } else if (result.reply && replyWritable) {
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
        process.stderr.write(chunk);
      }
    });

    chrome.on("exit", (code) => {
      if (!captured)
        reject(
          new Error(`Chrome exited with code ${code} before providing WS URL`)
        );
    });
    setTimeout(() => {
      if (!captured)
        reject(new Error("Timeout waiting for Chrome WS endpoint"));
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

    // Each WS connection gets its own adapter instance for independent state
    const adapter = new CDPAdapter();

    // Buffer messages until Chrome WS is open
    const buffered = [];

    function sendToChromeRaw(data) {
      if (chromeWs.readyState === WebSocketClient.OPEN) {
        chromeWs.send(typeof data === "string" ? data : JSON.stringify(data));
      } else {
        buffered.push(typeof data === "string" ? data : JSON.stringify(data));
      }
    }

    // Give adapter transport access
    adapter.setTransport(
      (msg) => sendToChromeRaw(JSON.stringify(msg)),
      (msg) => puppeteerWs.send(JSON.stringify(msg))
    );

    puppeteerWs.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        sendToChromeRaw(data);
        return;
      }

      const result = adapter.transformRequest(msg);
      if (result.reply) {
        puppeteerWs.send(JSON.stringify(result.reply));
      } else if (result.msg) {
        sendToChromeRaw(JSON.stringify(result.msg));
      }
    });

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
      if (result.drop) {
        // Internal message consumed by adapter
      } else if (result.msg) {
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
