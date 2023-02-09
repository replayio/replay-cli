/// <reference types="cypress" />

import dbg from "debug";

const debug = dbg("replay:cypress:mode");

// https://github.com/replayio/chromium-v8/blob/master/src/api/api.cc
const diagnosticFlags = [
  // Disable all tests for whether we are recording/replaying.
  "record-replay",

  // Assorted changes related to the GC and inspecting the heap.
  "gc-changes",

  // References are held on assorted objects to avoid problems when they are
  // destroyed at non-deterministic points.
  "leak-references",

  // Register scripts with the recorder.
  "register-scripts",

  // Emit special record/replay opcodes in registered scripts.
  "emit-opcodes",

  // Behavior changes in places when events are disallowed.
  "disallow-events",

  // Use strong pointers instead of weak pointers in certain places.
  "avoid-weak-pointers",

  // Behavior changes in places when events are passed through.
  "pass-through-events",

  // Don't compile "use asm" scripts as wasm.
  "no-asm-wasm",

  // Don't use cached results of script compilations.
  "no-compile-cache",

  // Compute IDs for pointers where necessary.
  "pointer-ids",

  // Explicitly record/replay values where necessary.
  "values",

  // Create checkpoints and setup functionality for inspecting state afterwards.
  "checkpoints",

  // Ensure that API interrupts will be performed at deterministic points.
  "interrupts",

  // Creating WebGL canvas contexts is disabled.
  "no-webgl",

  // Detecting the language in text is disabled.
  "no-language-detection",

  // Media playback is disabled.
  "no-media",

  // Field trials of new features are disabled.
  "no-field-trials",

  // Don't report V8 feature usage to the browser process.
  "no-count-usage",

  // Using the GPU is disabled.
  "no-gpu",

  // Computing stats for calls is disabled.
  "no-call-stats",

  // Parking strings is disabled.
  "no-park-strings",

  // Creating multiple worker threads for rendering is disabled.
  "no-render-workers",

  // Page timing metrics are not sent at non-deterministic points.
  "no-page-timing-metrics",

  // Disable the interactive detector related metrics, which can behave non-deterministically.
  "no-interactive-detector",

  // Notify the recorder about paints.
  "notify-paints",

  // Notify the recorder about network events.
  "notify-network",

  // Notify the recorder about HTML parses.
  "notify-html-parse",

  // Collect source maps referenced by scripts in the recording. This can be
  // separately disabled with the RECORD_REPLAY_DISABLE_SOURCEMAP_COLLECTION
  // environment variable.
  "collect-source-maps",

  // Force window proxies to be initialized for consistency with inspector
  // state when replaying.
  "initialize-window-proxy",

  // Install hook used by react devtools backend.
  "react-devtools-backend",

  // Disable baseline JIT compiler.
  "disable-baseline-jit",

  // Use optimizing JIT compiler.
  "use-optimizing-jit",

  // Send certain event information to render thread.
  "browser-event",

  // Record/replay events are turned off by default (for now) (RUN-1251)
  "disable-collect-events",
];

export enum ReplayMode {
  Record,
  RecordOnRetry,
  Diagnostics,
  Stress,
}

interface RetryEnv {
  retryCount?: string;
  retryIndex?: string;
  mode?: string;
}

function getRetryEnv(config?: Cypress.PluginConfigOptions): RetryEnv {
  const { cypress_repeat_n, cypress_repeat_k } = config?.env || {};

  const { REPLAY_CYPRESS_MODE: mode } = process.env;

  const env = {
    retryCount: cypress_repeat_n,
    retryIndex: cypress_repeat_k,
    mode,
  };

  debug("Environment: %o", env);

  return env;
}

function getReplayMode(): ReplayMode {
  const { mode } = getRetryEnv();

  switch (mode) {
    case "record-on-retry":
      return ReplayMode.RecordOnRetry;
    case "diagnostics":
      return ReplayMode.Diagnostics;
    case "stress":
      return ReplayMode.Stress;
  }

  return ReplayMode.Record;
}

function getRetryIndex(config: Cypress.PluginConfigOptions) {
  const retryIndex = getRetryEnv(config).retryIndex;
  return retryIndex ? Number.parseInt(retryIndex) : undefined;
}

export function getDiagnosticRetryCount() {
  switch (getReplayMode()) {
    case ReplayMode.RecordOnRetry:
      return 2;
    case ReplayMode.Diagnostics:
      return diagnosticFlags.length + 3;
    case ReplayMode.Stress:
      return 10;
    case ReplayMode.Record:
      return 1;
  }
}

export function getDiagnosticConfig(config: Cypress.PluginConfigOptions): {
  noRecord: boolean;
  env: NodeJS.ProcessEnv;
} {
  let noRecord = false;
  let env: NodeJS.ProcessEnv = {};
  const retryIndex = getRetryIndex(config);

  if (getReplayMode() === ReplayMode.RecordOnRetry) {
    noRecord = retryIndex === 1;
  }

  if (getReplayMode() === ReplayMode.Diagnostics && retryIndex) {
    switch (retryIndex) {
      case 1:
        noRecord = true;
        break;
      case 2:
        break;
      case 3:
        env = {
          RECORD_REPLAY_DISABLE_ASSERTS: "1",
          RECORD_REPLAY_DISABLE_SOURCEMAP_COLLECTION: "1",
        };
        break;
      default:
        env = {
          RECORD_REPLAY_DISABLE_FEATURES: diagnosticFlags[retryIndex - 3],
        };
    }
  }

  const cfg = { noRecord, env };
  debug("Diagnostic configuration for mode %d: %o", getReplayMode(), cfg);

  return cfg;
}
