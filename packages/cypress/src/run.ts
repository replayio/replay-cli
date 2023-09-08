import { gte } from "semver";

import cypressRepeat, { SpecRepeatMode } from "./cypress-repeat";
import { DiagnosticLevel, ReplayMode, configure } from "./mode";

export default function run({
  mode,
  level,
  count,
  timeout,
  ...options
}: {
  mode: ReplayMode;
  level: DiagnosticLevel;
  count?: number;
  timeout?: number;
} & Partial<CypressCommandLine.CypressRunOptions>) {
  const config = configure({ mode, level, stressCount: count });

  if (
    (mode === ReplayMode.Diagnostics || mode === ReplayMode.RecordOnRetry) &&
    !gte(require("cypress/package.json").version, "10.9.0")
  ) {
    console.error("Cypress 10.9 or greater is required for diagnostic or record-on-retry modes");
    process.exit(1);
  }

  return cypressRepeat({
    repeat: config.repeat,
    mode: config.mode === ReplayMode.RecordOnRetry ? SpecRepeatMode.Failed : SpecRepeatMode.All,
    untilPasses: config.mode === ReplayMode.RecordOnRetry,
    options,
    timeout,
  });
}
