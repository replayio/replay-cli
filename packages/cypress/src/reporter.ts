/// <reference types="cypress" />

import type { Test } from "@replayio/test-utils";
import debug from "debug";
import type { StepEvent } from "./support";
import { groupStepsByTest } from "./steps";

class CypressReporter {
  debug: debug.Debugger;
  startTime: number | undefined;
  steps: StepEvent[] = [];
  selectedBrowser: "chromium" | "firefox" | undefined;

  constructor(debug: debug.Debugger) {
    this.debug = debug.extend("reporter");
  }

  setStartTime(startTime: number) {
    this.startTime = startTime;
  }

  setSelectedBrowser(browser: "chromium" | "firefox") {
    this.selectedBrowser = browser;
  }

  clearSteps() {
    this.steps = [];
  }

  addStep(step: StepEvent) {
    this.steps.push(step);
  }

  getTestResults(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
    if (
      // If the browser crashes, no tests are run and tests will be null
      !result.tests ||
      // If the spec doesn't have any tests or all tests are pended, we should bail
      result.tests.length === 0 ||
      result.tests.every(t => t.state === "pending")
    ) {
      this.debug("No test results found for spec %s", spec.relative);
      return [];
    }

    let testsWithSteps: Test[] = [];
    try {
      testsWithSteps = groupStepsByTest(this.steps, this.startTime!, this.debug);
    } catch (e) {
      console.warn("Failed to build test step metadata for this replay.");
      console.warn(e);
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
        result: t.state == "failed" ? "failed" : "passed",
        error,
      };
    });

    return tests;
  }
}

export default CypressReporter;
