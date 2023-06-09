/// <reference types="cypress" />
import {
  getMetadataFilePath as getMetadataFilePathBase,
  ReplayReporter,
  TestMetadataV2,
  ReporterError,
} from "@replayio/test-utils";
import debug from "debug";

import { Errors } from "./error";
import { appendToFixtureFile, initFixtureFile } from "./fixture";
import { getDiagnosticConfig } from "./mode";
import { getTestsFromSteps, groupStepsByTest, mapStateToResult } from "./steps";
import type { StepEvent } from "./support";

type Test = TestMetadataV2.Test;

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
    this.reporter = new ReplayReporter(
      {
        name: "cypress",
        version: config.version,
        plugin: require("../package.json").version,
      },
      "2.0.0"
    );
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
    this.reporter.onTestBegin(undefined, getMetadataFilePath());
  }

  onAfterSpec(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
    appendToFixtureFile("spec:end", { spec, result });

    const tests = this.getTestResults(spec, result);
    this.reporter.onTestEnd({ tests, replayTitle: spec.relative, specFile: spec.relative });
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
      approximateDuration: 0,
      source: {
        title: spec.relative,
        scope: [],
      },
      result: "unknown",
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

    let testsWithSteps: Test[] = getTestsFromSteps(result.tests, this.steps);

    try {
      testsWithSteps = groupStepsByTest(testsWithSteps, this.steps);
    } catch (e: any) {
      console.warn("Failed to build test step metadata for this replay");
      console.warn(e);

      this.reporter.addError(e);
    }

    const tests = result.tests.map<Test>(t => {
      const foundTest = testsWithSteps.find(ts => ts.source.title === t.title[t.title.length - 1]);

      if (foundTest) {
        this.debug("Matching test result with test steps from support: %o", {
          testResult: t.title,
          testWithSteps: foundTest.source.title,
        });
      } else {
        this.debug("Failed to find matching test steps for test result: %o", {
          testResult: t.title,
        });
      }

      const error =
        t.displayError &&
        (!foundTest ||
          !Object.values(foundTest.events).some(testActions => testActions.some(a => a.data.error)))
          ? {
              name: "DisplayError",
              message: t.displayError.substring(0, t.displayError.indexOf("\n")),
            }
          : undefined;

      const mergedTest: Test = {
        ...placeholderTest,
        // If we found the test from the steps array (we should), merge it in
        // and overwrite the default title and relativePath values. It won't
        // have the correct path or result so those are added and we bubble up
        // the first error found in a step falling back to reported test error
        // if it exists.
        ...foundTest,
        result: mapStateToResult(t.state),
        error: error || null,
      };

      return mergedTest;
    });

    return tests;
  }
}

export function getMetadataFilePath(workerIndex = 0) {
  return getMetadataFilePathBase("CYPRESS", workerIndex);
}

export default CypressReporter;
