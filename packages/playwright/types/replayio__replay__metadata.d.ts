declare module '@replayio/replay/metadata' {
  export const test: {
    validate: (data: {test: Partial<TestMetadata>}) => TestMetadataEntry;
    init:  (data: Partial<TestMetadata>) => TestMetadataEntry;
  };

  export interface TestMetadataEntry {
    test: TestMetadata | null
  }

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
    run?: {
      id: string;
      title?: string;
    };
  }
}
