declare module '@replayio/replay/src/metadata/test' {
  export default function getMetadata(data: Partial<TestMetadata>): TestMetadata;

  export interface TestMetadata {
    version: 1,
    result: "passed" | "failed" | "timedOut";
    // the "path" to the test as a list of the branches of the describe/it tree
    path?: string[];
    // title of the current test
    title: string;
    // the file containing the test ran
    file?: string;
    // a unique identifier for the test run (e.g. the commit + the current time?)
    run?: string;
  }
}
