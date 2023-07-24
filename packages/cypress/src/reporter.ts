/// <reference types="cypress" />
import {
  getMetadataFilePath as getMetadataFilePathBase,
  ReplayReporter,
  TestMetadataV2,
  ReporterError,
  fetchWorkspaceConfig,
} from "@replayio/test-utils";
import debug from "debug";

import { Errors } from "./error";
import { appendToFixtureFile, initFixtureFile } from "./fixture";
import { getDiagnosticConfig } from "./mode";
import { getTestsFromResults, groupStepsByTest, sortSteps } from "./steps";
import type { StepEvent } from "./support";

type Test = TestMetadataV2.Test;
type TestRun = TestMetadataV2.TestRun;

function isStepEvent(value: unknown): value is StepEvent {
  if (
    value &&
    typeof value === "object" &&
    "event" in value &&
    typeof value.event === "string" &&
    ["step:enqueue", "step:start", "step:end", "test:start", "test:end"].includes(value.event)
  ) {
    return true;
  }

  return false;
}

class CypressReporter {
  reporter: ReplayReporter;
  config: Cypress.PluginConfigOptions;
  debug: debug.Debugger;
  startTime: number | undefined;
  steps: StepEvent[] = [];
  selectedBrowser: string | undefined;
  errors: string[] = [];
  diagnosticConfig: ReturnType<typeof getDiagnosticConfig> = { noRecord: false, env: {} };

  constructor(config: Cypress.PluginConfigOptions, debug: debug.Debugger) {
    initFixtureFile();

    this.config = config;
    this.reporter = new ReplayReporter(
      {
        name: "cypress",
        version: config.version,
        plugin: require("../package.json").version,
      },
      "2.1.0"
    );
    this.debug = debug.extend("reporter");

    this.configureDiagnostics();
  }

  async authenticate(apiKey: string) {
    this.reporter.setApiKey(apiKey);
    const { env } = await fetchWorkspaceConfig(apiKey);
    this.configureDiagnostics(env);
  }

  configureDiagnostics(extraEnv?: NodeJS.ProcessEnv) {
    this.diagnosticConfig = getDiagnosticConfig(this.config, extraEnv);

    // Mix diagnostic env into process env so it can be picked up by test
    // metrics and reported to telemetry
    Object.keys(this.diagnosticConfig.env).forEach(k => {
      process.env[k] = this.diagnosticConfig.env[k];
    });

    this.reporter.setDiagnosticMetadata(this.diagnosticConfig.env);
  }

  onLaunchBrowser(browser: string) {
    this.setSelectedBrowser(browser);
    this.reporter.onTestSuiteBegin(undefined, "CYPRESS_REPLAY_METADATA");

    // Cypress around 10.9 launches the browser before `before:spec` is called
    // causing us to fail to create the metadata file and link the replay to the
    // current test
    const metadataPath = getMetadataFilePath();
    this.reporter.onTestBegin(undefined, metadataPath);
  }

  onBeforeSpec(spec: Cypress.Spec) {
    const startTime = Date.now();
    appendToFixtureFile("spec:start", { spec, startTime });

    this.clearSteps();
    this.reporter.onTestBegin(undefined, getMetadataFilePath());
  }

  onAfterSpec(
    spec: Cypress.Spec,
    result: CypressCommandLine.RunResult
  ): { test: TestRun } | undefined {
    appendToFixtureFile("spec:end", { spec, result });

    const tests = this.getTestResults(spec, result);

    return this.reporter.onTestEnd({ tests, replayTitle: spec.relative, specFile: spec.relative });
  }

  getDiagnosticConfig() {
    return this.diagnosticConfig;
  }

  private setSelectedBrowser(browser: string) {
    this.selectedBrowser = browser;
  }

  private clearSteps() {
    this.steps = [];
  }

  addStep(step: StepEvent) {
    appendToFixtureFile("task", step);
    this.steps.push(step);
  }

  private getTestResults(spec: Cypress.Spec, result: CypressCommandLine.RunResult): Test[] {
    const placeholderTest: Test = {
      id: 0,
      approximateDuration: 0,
      source: {
        title: spec.relative,
        scope: [],
      },
      result: "unknown",
      attempt: 1,
      events: {
        afterAll: [],
        afterEach: [],
        beforeAll: [],
        beforeEach: [],
        main: [],
      },
      error: null,
    };

    if (
      // If the browser crashes, no tests are run and tests will be null
      !result.tests ||
      // If the spec doesn't have any tests, we should bail
      result.tests.length === 0
    ) {
      const msg = "No test results found for spec " + spec.relative;
      this.debug(msg);
      this.reporter.addError(new ReporterError(Errors.NoTestResults, msg, spec.relative));

      return [
        // return an placeholder test because cypress will still launch a
        // browser for a file that matches the spec format but doesn't contain
        // any tests.
        placeholderTest,
      ];
    }

    let testsWithoutSteps: Test[] = getTestsFromResults(result.tests);
    let testsWithSteps: Test[] = [];

    try {
      const sortedSteps = sortSteps(this.steps);
      testsWithSteps = groupStepsByTest(testsWithoutSteps, sortedSteps);
    } catch (e: any) {
      console.warn("Failed to build test step metadata for this replay");
      console.warn(e);

      this.reporter.addError(e);
    }

    return testsWithSteps;
  }
}

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("CYPRESS", workerIndex);
}

export default CypressReporter;
export { isStepEvent };
