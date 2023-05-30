type VersionCore = `${number}.${number}.${number}`;
type SemanticVersion = VersionCore | `${VersionCore}-${string}` | `${VersionCore}+${string}`;

interface TestMetadata {
  // user-provided name to distinguish between multiple test runs for the same commit
  suite?: string;
  // spec file
  file: string;
  // title of the test (for playwright) or the relative spec name (for cypress)
  title: string;
  result: TestResult;
  // this is valued but should be dropped. it's pulled the first test's path.
  path: string[];
  // before/after all hooks. Currently optional if no global hooks ran
  hooks?: {
    // hook title (e.g. beforeAll)
    title: string;
    // describe tree, empty array if it's a "root" before/after 
    // in cypress at least, there can be multiple beforeAll's at different levels
    path: string[];
    // steps executed in this hook
    steps: TestStep[];
  }[];
  tests: Test[];
  runner: {
    // name of the runner (cypress, playwright)
    name: string;
    // version of the runner
    // TODO: tighted up to semver in v2
    version: string;
    // version of the replay plugin
    // TODO: tighted up to semver in v2
    plugin: string;
  };
  run: {
    // UUID identifying the run
    id: string;
    // optional user-provided title for the test run
    title?: string;
    // optional mode (e.g. record-on-retry) injected by our cypress wrapper
    mode?: string;
  };
  // errors that occurred in the replay plugins (not test failures)
  reporterErrors: ReporterError[];
  version: number;
}

interface Test {
  title: string;
  // describe tree + test name
  path: string[];
  relativePath: string;
  result: TestResult;
  error?: TestError;
  steps: TestStep[];
  // these may exist but they are functionally unreliable so we shouldn't use
  // them in the frontend
  // relativeStartTime?: number;
  // duration?: number;
}

interface TestStep {
  // unique (within the test) ID for the step
  id: string;
  // the tree of describe()'s that leads to this step
  path: string[];
  // id of parent if this step is chained (cypress-specific atm i think)
  parentId?: string;
  // display name of the step (e.g. get or assert)
  name: string;
  // few notes:
  // * the playwright reporter doesn't send args so it's currently omitted
  // * the cypress reporter should always include args but they can be any type including object
  // This _should_ be string[] in the future with the plugins coercing the contents as needed
  args?: any[];
  error?: TestError;
  // The hook to which this step belongs.
  // This will be dropped in the future since it is redundant with the hook
  // block to which the step is added
  hook?: "beforeEach" | "afterEach" | "beforeAll" | "afterAll";
  // type of the command
  category: "command" | "assertion" | "other";

  // these may exist but they are functionally unreliable so we shouldn't use
  // them in the frontend
  // relativeStartTime?: number;
  // duration?: number;

  // These both may exist for cypress recordings but aren't needed to be
  // persisted and should be dropped
  // commandId?: string;
  // assertIds?: string[];
}

export interface TestError {
  message: string;
  line?: number;
  column?: number;
}

enum TestResult {
  "passed",
  "failed",
  "timedOut",
  "skipped",
  "unknown",
}

interface ReporterError {
  name: "ReporterError";
  message: string;
  test?: string;
  detail?: any;
}
