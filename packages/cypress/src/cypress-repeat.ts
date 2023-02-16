// Adapted from https://github.com/bahmutov/cypress-repeat

import cypress from "cypress";
import dbg from "debug";

const debug = dbg("replay:cypress:repeat");

// allows us to debug any cypress install problems
debug("requiring cypress with module.paths %o", module.paths);

/**
 * Quick and dirty deep clone
 */
const clone = (x: any) => JSON.parse(JSON.stringify(x));

function buildAllRunOptions(repeatNtimes: number, options: Record<string, any>) {
  const allRunOptions: Record<string, any>[] = [];

  for (let k = 0; k < repeatNtimes; k += 1) {
    const runOptions = clone(options);

    const envVariables = `cypress_repeat_n=${repeatNtimes},cypress_repeat_k=${k + 1}`;
    if (!("env" in runOptions)) {
      runOptions.env = envVariables;
    } else {
      runOptions.env += "," + envVariables;
    }

    if (options.record && options.group) {
      // we are recording, thus we need to update the group name
      // to avoid clashing
      runOptions.group = options.group;

      if (runOptions.group && repeatNtimes > 1) {
        // make sure if we are repeating this example
        // then the recording has group names on the Dashboard
        // like "example-1-of-20", "example-2-of-20", ...
        runOptions.group += `-${k + 1}-of-${repeatNtimes}`;
      }
    }

    allRunOptions.push(runOptions);
  }

  return allRunOptions;
}

export enum SpecRepeatMode {
  All,
  Failed,
}

export default async function CypressRepeat({
  repeat = 1,
  mode = SpecRepeatMode.All,
  untilPasses = false,
  args = [],
}: {
  repeat?: number;
  mode?: SpecRepeatMode;
  untilPasses?: boolean;
  args?: string[];
}) {
  const name = "cypress-repeat:";
  const rerunFailedOnly = mode === SpecRepeatMode.Failed;

  console.log("%s will repeat Cypress command %d time(s)", name, repeat);

  if (untilPasses) {
    console.log("%s but only until it passes", name);
  }

  if (rerunFailedOnly) {
    console.log("%s it only reruns specs which have failed", name);
  }

  const parseArguments = async () => {
    return await cypress.cli.parseRunArguments(["cypress", "run", ...args]);
  };

  const options = await parseArguments();

  debug("parsed CLI options %o", options);

  const allRunOptions = buildAllRunOptions(repeat, options);

  debug("run options %s", allRunOptions);

  for (let [k, runOptions] of allRunOptions.entries()) {
    const n = allRunOptions.length;
    const isLastRun = k === n - 1;
    console.log("***** %s %d of %d *****", name, k + 1, n);

    const testResults:
      | CypressCommandLine.CypressRunResult
      | CypressCommandLine.CypressFailedRunResult = await cypress.run(runOptions);

    debug(
      "is %d the last run? %o",
      k,
      { isLastRun, rerunFailedOnly, runs: (testResults as any).runs }
      // JSON.stringify(testResults)
    );
    if (rerunFailedOnly && !isLastRun && "runs" in testResults) {
      const failedSpecs = testResults.runs
        .filter(run => run.stats.failures != 0)
        .map(run => run.spec.relative)
        .join(",");

      if (failedSpecs.length) {
        console.log("%s failed specs", name);
        console.log(failedSpecs);
        allRunOptions[k + 1].spec = failedSpecs;
      } else if (untilPasses) {
        console.log("%s there were no failed specs", name);
        console.log("%s exiting", name);

        return 0;
      }
    }

    if (testResults.status === "failed") {
      // failed to even run Cypress tests
      if (testResults.failures) {
        console.error(testResults.message);

        return testResults.failures;
      }
    }

    if (testResults.status === "finished") {
      if (untilPasses) {
        if (!testResults.totalFailed) {
          console.log("%s successfully passed on run %d of %d", name, k + 1, n);

          return 0;
        }
        console.error("%s run %d of %d failed", name, k + 1, n);
        if (k === n - 1) {
          console.error("%s no more attempts left", name);
          return testResults.totalFailed;
        }
      } else {
        if (testResults.totalFailed) {
          console.error("%s run %d of %d failed", name, k + 1, n, isLastRun);
          if (isLastRun) {
            return testResults.totalFailed;
          }
        }
      }
    }

    console.log("***** finished %d run(s) *****", k + 1);
  }

  return 0;
}
