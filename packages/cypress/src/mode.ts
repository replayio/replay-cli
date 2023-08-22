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
  Record = "record",
  RecordOnRetry = "record-on-retry",
  Diagnostics = "diagnostics",
  Stress = "stress",
}

export enum DiagnosticLevel {
  None = "none",
  Basic = "basic",
  Full = "full",
}

export function configure(options: {
  mode: ReplayMode;
  level?: DiagnosticLevel;
  stressCount?: number;
}) {
  // Set this modes into the environment so they can be picked up by the plugin
  process.env.REPLAY_CYPRESS_MODE = options.mode;
  if (options.mode === ReplayMode.Diagnostics && options.level) {
    process.env.REPLAY_CYPRESS_DIAGNOSTIC_LEVEL = options.level;
  }

  const config = {
    mode: options.mode,
    level: options.level,
    repeat: getRepeatCount(options.mode, options.level, options.stressCount),
  };

  // configure shared metadata values
  process.env.RECORD_REPLAY_METADATA_TEST_RUN_MODE = config.mode;
  // set a test run id so all the replays share a run when running in retry modes
  process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID =
    process.env.RECORD_REPLAY_METADATA_TEST_RUN_ID || v4();

  return config;
}

export function toReplayMode(mode?: string) {
  if (!mode) {
    mode = "record";
  }

  switch (mode) {
    case "diagnostics":
      mode = "diagnostics";
      break;
    case "record-on-retry":
    case "diagnostic":
    case "stress":
    case "record":
      break;
    default:
      throw new Error("Unexpected mode value: " + mode);
  }

  return mode as ReplayMode;
}

export function toDiagnosticLevel(level?: string) {
  if (!level) {
    level = "none";
  }

  switch (level) {
    case "basic":
    case "full":
    case "none":
      break;
    default:
      throw new Error("Unexpected level value: " + level);
  }

  return level as DiagnosticLevel;
}

function getRepeatCount(mode: ReplayMode, diagnosticLevel?: DiagnosticLevel, stressCount = 10) {
  switch (mode) {
    case ReplayMode.RecordOnRetry:
      return 2;
    case ReplayMode.Diagnostics:
      return diagnosticLevel === DiagnosticLevel.Basic ? 3 : diagnosticFlags.length + 3;
    case ReplayMode.Stress:
      return stressCount;
    case ReplayMode.Record:
      return 1;
  }
}

export function getDiagnosticConfig(
  config: Cypress.PluginConfigOptions,
  extraEnv: NodeJS.ProcessEnv = {}
): {
  noRecord: boolean;
  env: NodeJS.ProcessEnv;
} {
  let noRecord = false;
  let env: NodeJS.ProcessEnv = {
    ...extraEnv,
  };

  const { cypress_repeat_k } = config.env;
  const repeatIndex = cypress_repeat_k ? Number.parseInt(cypress_repeat_k) : undefined;

  const mode = toReplayMode(process.env.REPLAY_CYPRESS_MODE);

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
          RECORD_REPLAY_DISABLE_FEATURES: JSON.stringify(diagnosticFlags.slice(repeatIndex - 4)),
        };
    }
  }

  const cfg = { noRecord, env };
  debug("Diagnostic configuration for mode %d: %o", mode, cfg);

  return cfg;
}
