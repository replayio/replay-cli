import type { getRecordings as getRecordingsStatic } from "./getRecordings";

describe("getRecordings", () => {
  let getRecordings: typeof getRecordingsStatic;
  let mockExistsSync: jest.MockInstance<boolean, []>;
  let mockReadFileSync: jest.MockInstance<string, [string]>;

  beforeEach(() => {
    jest.mock("fs-extra");

    mockExistsSync = require("fs-extra").existsSync;
    mockExistsSync.mockReturnValue(true);

    mockReadFileSync = require("fs-extra").readFileSync;
    mockReadFileSync.mockReturnValue("");

    getRecordings = require("./getRecordings").getRecordings;
  });

  it("should parse an empty log", () => {
    const recordings = getRecordings();
    expect(recordings).toHaveLength(0);
  });

  it("should parse a log with finished recordings", () => {
    mockReadFileSync.mockReturnValue(`
      {"id":"fake","kind":"createRecording"}
      {"id":"fake","kind":"addMetadata","metadata":{"processGroupId":"fake"}}
      {"id":"fake","kind":"addMetadata","metadata":{"process":"root"}}
      {"id":"fake","kind":"addMetadata","metadata":{"uri":"https://www.fake.com/"}}
      {"id":"fake","kind":"writeStarted","path":"~/.replay/recording-fake.dat"}
      {"id":"fake","kind":"writeFinished"}
    `);

    const recordings = getRecordings();
    expect(recordings).toHaveLength(1);
    expect(recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ processType: "root" }),
          processingStatus: undefined,
          recordingStatus: "finished",
        }),
      ])
    );
  });

  it("should parse a log with in-progress recordings", () => {
    mockReadFileSync.mockReturnValue(`
      {"id":"fake","kind":"createRecording"}
      {"id":"fake","kind":"addMetadata","metadata":{"processGroupId":"fake"}}
      {"id":"fake","kind":"addMetadata","metadata":{"process":"root"}}
      {"id":"fake","kind":"addMetadata","metadata":{"uri":"https://www.fake.com/"}}
      {"id":"fake","kind":"writeStarted","path":"~/.replay/recording-fake.dat"}
    `);

    const recordings = getRecordings();
    expect(recordings).toHaveLength(1);
    expect(recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordingStatus: "recording",
        }),
      ])
    );
  });

  it("should parse a log with crashed recordings", () => {
    mockReadFileSync.mockReturnValue(`
      {"id":"fake","kind":"createRecording"}
      {"id":"fake","kind":"addMetadata","metadata":{"processGroupId":"fake"}}
      {"id":"fake","kind":"addMetadata","metadata":{"process":"root"}}
      {"id":"fake","kind":"addMetadata","metadata":{"uri":"https://www.fake.com/"}}
      {"id":"fake","kind":"writeStarted","path":"~/.replay/recording-fake.dat"}
      {"id":"fake","kind":"crashed"}
    `);

    const recordings = getRecordings();
    expect(recordings).toHaveLength(1);
    expect(recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordingStatus: "crashed",
        }),
      ])
    );
  });

  it("should parse a log with unusable recordings", () => {
    mockReadFileSync.mockReturnValue(`
      {"id":"fake","kind":"createRecording"}
      {"id":"fake","kind":"addMetadata","metadata":{"processGroupId":"fake"}}
      {"id":"fake","kind":"addMetadata","metadata":{"process":"root"}}
      {"id":"fake","kind":"addMetadata","metadata":{"uri":"https://www.fake.com/"}}
      {"id":"fake","kind":"writeStarted","path":"~/.replay/recording-fake.dat"}
      {"id":"fake","kind":"recordingUnusable","reason":"Recording invalidated: Stack overflow"}
      {"id":"fake","kind":"writeFinished"}
    `);

    const recordings = getRecordings();
    expect(recordings).toHaveLength(1);
    expect(recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordingStatus: "unusable",
          unusableReason: "Recording invalidated: Stack overflow",
        }),
      ])
    );
  });

  it("should parse a log with out-of-order entries", () => {
    mockReadFileSync.mockReturnValue(`
      {"id":"fake","kind":"addMetadata","metadata":{"processGroupId":"fake"}}
      {"id":"fake","kind":"addMetadata","metadata":{"process":"root"}}
      {"id":"fake","kind":"addMetadata","metadata":{"uri":"https://www.fake.com/"}}
      {"id":"fake","kind":"createRecording"}
      {"id":"fake","kind":"writeStarted","path":"~/.replay/recording-fake.dat"}
      {"id":"fake","kind":"writeFinished"}
    `);

    const recordings = getRecordings();
    expect(recordings).toHaveLength(1);
    expect(recordings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ processType: "root" }),
          processingStatus: undefined,
          recordingStatus: "finished",
        }),
      ])
    );
  });

  it("should gracefully handle missing recording log entries", () => {
    mockReadFileSync.mockReturnValue(`
      {"id":"fake","kind":"addMetadata","metadata":{"processGroupId":"fake"}}
      {"id":"fake","kind":"writeFinished"}
    `);

    const recordings = getRecordings();
    expect(recordings).toHaveLength(0);
  });
});
