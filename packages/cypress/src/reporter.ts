/// <reference types="cypress" />
import {
  getMetadataFilePath as getMetadataFilePathBase,
  ReplayReporter,
  TestMetadataV2,
  ReporterError,
  fetchWorkspaceConfig,
  ReplayReporterConfig,
} from "@replayio/test-utils";
import dbg from "debug";

import { Errors } from "./error";
import { appendToFixtureFile, initFixtureFile } from "./fixture";
import { getTestsFromResults, groupStepsByTest, sortSteps } from "./steps";
import type { StepEvent } from "./support";
import { PluginFeature, getFeatures, isFeatureEnabled } from "./features";

type Test = TestMetadataV2.Test;

type ReplayCypressRecordingMetadata = {
  title: string;
  test: TestMetadataV2.TestRun;
};

// `filter` is re-applied here so its deprecated comment gets lost here
// `upload` gets simplified to a boolean (until the advanced options are tested with Cypress)
export interface PluginOptions
  extends Omit<ReplayReporterConfig<ReplayCypressRecordingMetadata>, "filter" | "upload"> {
  filter?: ReplayReporterConfig<ReplayCypressRecordingMetadata>["filter"];
  upload?: boolean;
}

const debug = dbg("replay:cypress:reporter");
const MAX_WAIT = 20_000;

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
  public config: Cypress.PluginConfigOptions;
  public options: PluginOptions;
  reporter: ReplayReporter<ReplayCypressRecordingMetadata>;
  startTime: number | undefined;
  steps: StepEvent[] = [];
  selectedBrowser: string | undefined;
  errors: string[] = [];
  featureOptions: string | undefined;
  private _extraEnv: NodeJS.ProcessEnv = {};

  constructor(config: Cypress.PluginConfigOptions, options: PluginOptions) {
    initFixtureFile();

    this.config = config;
    this.options = options;

    this.reporter = new ReplayReporter(
      {
        name: "cypress",
        version: config.version,
        plugin: require("@replayio/cypress/package.json").version,
      },
      "3.0.0",
      { ...this.options, metadataKey: "CYPRESS_REPLAY_METADATA" }
    );

    this.featureOptions = process.env.CYPRESS_REPLAY_PLUGIN_FEATURES;
    debug("Features: %o", getFeatures(this.featureOptions));
  }

  isFeatureEnabled(feature: PluginFeature) {
    return isFeatureEnabled(this.featureOptions, feature);
  }

  async authenticate(apiKey: string) {
    this.reporter.setApiKey(apiKey);
    const { env } = await fetchWorkspaceConfig(apiKey);
    debug("Set extra env: %o", env);
    this._extraEnv = env;
    this.reporter.setDiagnosticMetadata(env);
  }

  onLaunchBrowser(browser: string) {
    this.setSelectedBrowser(browser);
    this.reporter.onTestSuiteBegin();

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

  async waitForStableStepCount() {
    let currentCount = this.getStepCount();
    const startTime = Date.now();
    while (Date.now() < startTime + MAX_WAIT) {
      debug("Waiting for stable step count: %d", currentCount);
      const previousCount = currentCount;
      await new Promise(resolve => setTimeout(resolve, 250));
      currentCount = this.getStepCount();

      if (previousCount === currentCount) {
        debug("Step count stable at %d after %s ms", Date.now() - startTime);
        break;
      }
    }
  }

  async onAfterSpec(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
    appendToFixtureFile("spec:end", { spec, result });

    await this.waitForStableStepCount();
    const tests = this.getTestResults(spec, result);

    this.reporter.onTestEnd({
      tests,
      replayTitle: spec.relative,
      specFile: spec.relative,
      runnerGroupKey: spec.relative,
    });
  }

  onEnd() {
    return this.reporter.onEnd();
  }

  getExtraEnv() {
    return this._extraEnv;
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

  getStepCount() {
    return this.steps.length;
  }

  private getTestResults(spec: Cypress.Spec, result: CypressCommandLine.RunResult): Test[] {
    const placeholderTest: Test = {
      id: 0,
      executionId: [1, spec.relative].join("-"),
      approximateDuration: 0,
      source: {
        title: spec.relative,
        scope: [],
      },
      result: "unknown",
      attempt: 1,
      maxAttempts: 1,
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
      debug(msg);
      this.reporter.addError(new ReporterError(Errors.NoTestResults, msg, spec.relative));

      return [
        // return an placeholder test because cypress will still launch a
        // browser for a file that matches the spec format but doesn't contain
        // any tests.
        placeholderTest,
      ];
    }

    let testsWithoutSteps = getTestsFromResults(
      result.tests,
      this.steps.filter(s => s.event === "test:start")
    );
    let testsWithSteps: Test[] = [];

    try {
      const sortedSteps = sortSteps(this.steps);
      testsWithSteps = groupStepsByTest(testsWithoutSteps, sortedSteps);
    } catch (e: any) {
      console.warn("Failed to build test step metadata for this replay");
      console.warn(e);

      this.reporter.addError(e);

      // return tests without steps otherwise the test-utils reporter will bail
      // and we'll lose the error altogether.
      return testsWithoutSteps;
    }

    return testsWithSteps;
  }
}

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("CYPRESS", workerIndex);
}

export default CypressReporter;
export { isStepEvent };
