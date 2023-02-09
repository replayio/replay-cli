/// <reference types="cypress" />

import dbg from "debug";

const debug = dbg("replay:cypress:mode");

// https://github.com/replayio/chromium-v8/blob/master/src/api/api.cc
const diagnosticFlags = [
  "record-replay",
  "gc-changes",
  "leak-references",
  "register-scripts",
  "emit-opcodes",
  "disallow-events",
  "avoid-weak-pointers",
  "pass-through-events",
  "no-asm-wasm",
  "no-compile-cache",
  "pointer-ids",
  "values",
  "checkpoints",
  "interrupts",
  "no-webgl",
  "no-language-detection",
  "no-media",
  "no-field-trials",
  "no-count-usage",
  "no-gpu",
  "no-call-stats",
  "no-park-strings",
  "no-render-workers",
  "no-page-timing-metrics",
  "no-interactive-detector",
  "notify-paints",
  "notify-network",
  "notify-html-parse",
  "collect-source-maps",
  "initialize-window-proxy",
  "react-devtools-backend",
  "disable-baseline-jit",
  "use-optimizing-jit",
  "browser-event",
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

export function getReplayMode(): ReplayMode {
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
