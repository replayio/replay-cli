import { RecordingEntry, filterRecordings } from "./main";

describe("filterRecordings", () => {
  it("excludes crash reports by default", () => {
    const recordings: RecordingEntry[] = [
      {
        status: "crashed",
        id: "1",
        createTime: new Date(),
        metadata: {},
        runtime: "chromium",
        sourcemaps: [],
      },
      {
        status: "crashUploaded",
        id: "2",
        createTime: new Date(),
        metadata: {},
        runtime: "chromium",
        sourcemaps: [],
      },
      {
        status: "onDisk",
        id: "3",
        createTime: new Date(),
        metadata: {},
        runtime: "chromium",
        sourcemaps: [],
      },
    ];

    const filtered = filterRecordings(recordings, r => r.id === "3", false);
    expect(filtered).toHaveLength(1);
  });
  it("inclues crash reports when includeCrashes is set", () => {
    const recordings: RecordingEntry[] = [
      {
        status: "crashed",
        id: "1",
        createTime: new Date(),
        metadata: {},
        runtime: "chromium",
        sourcemaps: [],
      },
      {
        status: "crashUploaded",
        id: "2",
        createTime: new Date(),
        metadata: {},
        runtime: "chromium",
        sourcemaps: [],
      },
      {
        status: "onDisk",
        id: "3",
        createTime: new Date(),
        metadata: {},
        runtime: "chromium",
        sourcemaps: [],
      },
    ];

    const filtered = filterRecordings(recordings, r => r.id === "3", true);
    expect(filtered).toHaveLength(2);
  });
});
