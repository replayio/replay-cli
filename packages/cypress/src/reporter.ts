/// <reference types="cypress" />

import type { Test } from "@replayio/test-utils";
import type { StepEvent } from "./support";
import { groupStepsByTest } from "./steps";

class CypressReporter {
  startTime: number | undefined;
  steps: StepEvent[] = [];
  selectedBrowser: "chromium" | "firefox" | undefined;

  setStartTime(startTime: number) {
    this.startTime = startTime;
  }

  setSelectedBrowser(browser: "chromium" | "firefox") {
    this.selectedBrowser = browser;
  }

  addStep(step: StepEvent) {
    this.steps.push(step);
  }

  getTestResults(spec: Cypress.Spec, result: CypressCommandLine.RunResult) {
    let testsWithSteps: Test[] = [];
    try {
      testsWithSteps = groupStepsByTest(this.steps, this.startTime!);
    } catch (e) {
      console.warn("Failed to build test step metadata for this replay.");
      console.warn(e);
    }

    const tests = result.tests.map<Test>(t => {
      const foundTest = testsWithSteps.find(ts => ts.title === t.title[t.title.length - 1]) || null;

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
        path: ["", this.selectedBrowser || "", spec.relative, spec.specType || ""],
        result: t.state == "failed" ? "failed" : "passed",
        error,
      };
    });

    return tests;
  }
}

export default CypressReporter;
