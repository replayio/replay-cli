---
"replayio": patch
"@replayio/playwright": patch
"@replayio/cypress": patch
"@replayio/jest": patch
"@replayio/puppeteer": patch
---

add client attribution headers for telemetry. sends X-Client-Info on outbound HTTP requests to enable backend source tracking. forwards REPLAY_CLIENT_SOURCE env var as X-Replay-Source header when set by orchestrated environments.
