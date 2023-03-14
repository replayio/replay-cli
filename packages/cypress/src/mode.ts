import dbg from "debug";
import { v4 } from "uuid";

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

export enum DiagnosticLevel {
  None,
  Basic,
  Full,
}

export function configure(options: { mode?: string; level?: string; stressCount?: number }) {
  // Set this modes into the environment so they can be picked up by the plugin
  process.env.REPLAY_CYPRESS_MODE = options.mode;
  process.env.REPLAY_CYPRESS_DIAGNOSTIC_LEVEL = options.level;

  const config = {
    mode: getReplayMode(),
    level: getDiagnosticLevel(),
    repeat: getRepeatCount(options.stressCount),
  };

  // configure shared metadata values
  process.env.RECORD_REPLAY_METADATA_TEST_RUN_MODE = toModeString(config.mode);
  // set a test run id so all the replays share a run when running in retry modes
  process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID =
    process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || v4();

  return config;
}

function toModeString(mode: ReplayMode) {
  switch (mode) {
    case ReplayMode.Record:
      return "record";
    case ReplayMode.RecordOnRetry:
      return "record-on-retry";
    case ReplayMode.Diagnostics:
      return "diagnostics";
    case ReplayMode.Stress:
      return "stress";
  }
}

function getReplayMode(): ReplayMode {
  const { REPLAY_CYPRESS_MODE: mode } = process.env;

  switch (mode) {
    case "record-on-retry":
      return ReplayMode.RecordOnRetry;
    case "diagnostic":
    case "diagnostics":
      process.env.REPLAY_CYPRESS_MODE = "diagnostics";
      return ReplayMode.Diagnostics;
    case "stress":
      return ReplayMode.Stress;
  }

  process.env.REPLAY_CYPRESS_MODE = "record";
  return ReplayMode.Record;
}

function getDiagnosticLevel(): DiagnosticLevel {
  const mode = getReplayMode();
  const { REPLAY_CYPRESS_DIAGNOSTIC_LEVEL: level } = process.env;

  switch (level) {
    case "basic":
      return DiagnosticLevel.Basic;
    case "full":
      return DiagnosticLevel.Full;
  }

  return mode === ReplayMode.Diagnostics ? DiagnosticLevel.Basic : DiagnosticLevel.None;
}

function getRepeatCount(stressCount = 10) {
  const level = getDiagnosticLevel();

  switch (getReplayMode()) {
    case ReplayMode.RecordOnRetry:
      return 2;
    case ReplayMode.Diagnostics:
      return level === DiagnosticLevel.Basic ? 3 : diagnosticFlags.length + 3;
    case ReplayMode.Stress:
      return stressCount;
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

  const { cypress_repeat_k } = config.env;
  const repeatIndex = cypress_repeat_k ? Number.parseInt(cypress_repeat_k) : undefined;
  const mode = getReplayMode();

  if (mode === ReplayMode.RecordOnRetry) {
    noRecord = repeatIndex === 1;
  }

  if (mode === ReplayMode.Diagnostics && repeatIndex) {
    switch (repeatIndex) {
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
          RECORD_REPLAY_DISABLE_FEATURES: diagnosticFlags[repeatIndex - 3],
        };
    }
  }

  const cfg = { noRecord, env };
  debug("Diagnostic configuration for mode %d: %o", mode, cfg);

  return cfg;
}
