import { ExternalRecordingEntry } from "../types";
import { formatAllRecordings } from "./formatRecordings";

describe("formatRecordings", () => {
  it("formats one basic recording", () => {
    const recordings: ExternalRecordingEntry[] = [
      {
        id: "1",
        createTime: new Date("2020-01-01"),
        runtime: "node",
        metadata: {},
        status: "onDisk",
        sourcemaps: [],
      },
    ];
    const result = formatAllRecordings(recordings);
    expect(result).toMatchSnapshot();
  });

  it("sorts recording by createTime, most recent recording first", () => {
    const recordings: ExternalRecordingEntry[] = [
      {
        id: "1",
        createTime: new Date("2020-01-01"),
        runtime: "node",
        metadata: {
          uri: "test",
        },
        status: "onDisk",
        sourcemaps: [],
      },
      {
        id: "2",
        createTime: new Date("2020-01-02"),
        runtime: "node",
        metadata: {
          argv: ["test", "foo", "bar"],
        },
        status: "onDisk",
        sourcemaps: [],
      },
    ];
    const result = formatAllRecordings(recordings);
    expect(result).toMatchSnapshot();
  });
});
