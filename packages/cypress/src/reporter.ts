/// <reference types="cypress" />
import {
  getMetadataFilePath as getMetadataFilePathBase,
  ReplayReporter,
  Test,
  Hook,
  ReporterError,
} from "@replayio/test-utils";
import debug from "debug";

import { appendToFixtureFile, initFixtureFile } from "./fixture";
import { getDiagnosticConfig } from "./mode";
import { groupStepsByTest, mapStateToResult } from "./steps";
import type { StepEvent } from "./support";

class CypressReporter {
  reporter: ReplayReporter;
  config: Cypress.PluginConfigOptions;
  debug: debug.Debugger;
  startTime: number | undefined;
  steps: StepEvent[] = [];
  selectedBrowser: string | undefined;
  errors: string[] = [];
  diagnosticConfig: ReturnType<typeof getDiagnosticConfig>;

  constructor(config: Cypress.PluginConfigOptions, debug: debug.Debugger) {
    initFixtureFile();

    this.config = config;
    this.reporter = new ReplayReporter({
      name: "cypress",
      version: config.version,
      plugin: require("../package.json").version,
    });
    this.debug = debug.extend("reporter");

    this.diagnosticConfig = getDiagnosticConfig(config);

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
    this.setStartTime(startTime);
    this.reporter.onTestBegin(undefined, getMetadataFilePath());
  }

  onAfterSpec(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
    appendToFixtureFile("spec:end", { spec, result });

    const { hooks, tests } = this.getTestResults(spec, result);
    this.reporter.onTestEnd(tests, hooks, spec.relative);
  }

  getDiagnosticConfig() {
    return this.diagnosticConfig;
  }

  private setStartTime(startTime: number) {
    this.startTime = startTime;
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

  private getTestResults(
    spec: Cypress.Spec,
    result: CypressCommandLine.RunResult
  ): { hooks: Hook[]; tests: Test[] } {
    if (
      // If the browser crashes, no tests are run and tests will be null
      !result.tests ||
      // If the spec doesn't have any tests, we should bail
      result.tests.length === 0
    ) {
      const msg = "No test results found for spec " + spec.relative;
      this.debug(msg);
      this.reporter.addError(new ReporterError(spec.relative, msg));

      return {
        hooks: [],
        tests: [
          // return an placeholder test because cypress will still launch a
          // browser for a file that matches the spec format but doesn't contain
          // any tests.
          {
            title: spec.relative,
            path: [spec.relative],
            result: "unknown",
            relativePath: spec.relative,
          },
        ],
      };
    }

    let testsWithSteps: Test[] = [];
    let hooksWithSteps: Hook[] = [];
    try {
      const grouped = groupStepsByTest(spec, result.tests, this.steps, this.startTime!, this.debug);
      testsWithSteps = grouped.tests;
      hooksWithSteps = grouped.hooks;
    } catch (e: any) {
      console.warn("Failed to build test step metadata for this replay.");
      console.warn(e);

      this.reporter.addError(e);
    }

    const tests = result.tests.map<Test>(t => {
      const foundTest = testsWithSteps.find(ts => ts.title === t.title[t.title.length - 1]);

      if (foundTest) {
        this.debug("Matching test result with test steps from support: %o", {
          testResult: t.title,
          testWithSteps: foundTest.path,
        });
      } else {
        this.debug("Failed to find matching test steps for test result: %o", {
          testResult: t.title,
        });
      }

      const error = t.displayError
        ? {
            // typically, we won't use this because we'll have a step error that
            // originated the message but keeping as a fallback
            message: t.displayError.substring(0, t.displayError.indexOf("\n")),
          }
        : undefined;

      return {
        title: t.title[t.title.length - 1] || spec.relative,
        // If we found the test from the steps array (we should), merge it in
        // and overwrite the default title and relativePath values. It won't
        // have the correct path or result so those are added and we bubble up
        // the first error found in a step falling back to reported test error
        // if it exists.
        ...foundTest,
        relativePath: spec.relative,
        path: ["", this.selectedBrowser || "", spec.relative, ...(foundTest?.path || [])],
        result: mapStateToResult(t.state),
        error,
      };
    });

    return {
      hooks: hooksWithSteps,
      tests,
    };
  }
}

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("CYPRESS", workerIndex);
}

export default CypressReporter;
