import { ExternalRecordingEntry } from "../types";
import { formatAllRecordingsHumanReadable, formatAllRecordingsJson } from "./formatRecordings";

describe("formatAllRecordingsHumanReadable", () => {
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
    const result = formatAllRecordingsHumanReadable(recordings);
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
    const result = formatAllRecordingsHumanReadable(recordings);
    expect(result).toMatchSnapshot();
  });
});

describe("formatAllReordingsJson", () => {
  it("formats a recording as JSON", () => {
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
    const result = formatAllRecordingsJson(recordings);
    const parsedJson = JSON.parse(result);
    expect(parsedJson).toBeInstanceOf(Array);
  });

  it("matches snapshot", () => {
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
      {
        id: "48703074-c19b-4cbd-be85-b860d26e8b24",
        createTime: new Date("Wed Jul 13 2022 20:35:07 GMT-0700 (Pacific Daylight Time)"),
        runtime: "node",
        metadata: {
          argv: ["/Users/dan/.nvm/versions/node/v16.13.0/bin/npx", "@replayio/replay", "ls"],
          title: "Replay of npx",
        },
        sourcemaps: [
          {
            id: "1",
            originalSources: [],
            path: "/Users/dan/.replay/sourcemap-7182615795.map",
            baseURL:
              "file:///Users/dan/.nvm/versions/node/v16.13.0/lib/node_modules/npm/node_modules/@tootallnate/once/dist/index.js.map",
            targetContentHash:
              "sha256:b9d3770080970a3e2923463bd5f5dc4e5f15493cc4d4d762eb60b7cd3eaeca14",
            targetURLHash:
              "sha256:e2bdfba8215cc5dd4ec43adc0417b5107aed8be39e4d904401f43268a546f5bc",
            targetMapURLHash:
              "sha256:b25adc50556e34b0ee1c13ec52717a1c23118970538906fe908693036d6ee912",
          },
          {
            id: "2",
            originalSources: [],
            path: "/Users/dan/.replay/sourcemap-2269761573.map",
            baseURL:
              "file:///Users/dan/.nvm/versions/node/v16.13.0/lib/node_modules/npm/node_modules/agent-base/dist/src/index.js.map",
            targetContentHash:
              "sha256:13b6d658b492796461358e19fe1de30665ab2efb04c726b82530352cd364d4ac",
            targetURLHash:
              "sha256:41cb32196455d4d70440862ba8d8aa45e7a2eb1a8d9cef9d5f48558550f8edb9",
            targetMapURLHash:
              "sha256:105675b27ce1fc36fa2ce03826873962ae5abc76c849ee40a52863cbcd73557f",
          },
          {
            id: "3",
            originalSources: [],
            path: "/Users/dan/.replay/sourcemap-5611864844.map",
            baseURL:
              "file:///Users/dan/.nvm/versions/node/v16.13.0/lib/node_modules/npm/node_modules/http-proxy-agent/dist/index.js.map",
            targetContentHash:
              "sha256:37c871632157431d22c0667a1688d54644e5d8172400cf21c747dd2f46cc4f47",
            targetURLHash:
              "sha256:bc5cddb6dab652efb92d4aecfbf67026f9d458a83101222d990e58433446a566",
            targetMapURLHash:
              "sha256:bbfa1057c6af9c45732ce5f57bbb38e55200ba21eb19dc7a2d939a472962f5c9",
          },
        ],
        status: "startedWrite",
        path: "/Users/dan/.replay/recording-48703074-c19b-4cbd-be85-b860d26e8b24.dat",
      },
    ];
    const result = formatAllRecordingsJson(recordings);
    expect(result).toMatchSnapshot();
  });
});
