import { readRecordings } from "./recordingLog";
import { tmpdir } from "os";
import path from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";

describe("recordingLog", () => {
  let dir: string;

  beforeEach(() => {
    dir = path.join(tmpdir(), Math.floor(Math.random() * 100000).toString(16));
    mkdirSync(dir);
  });

  afterEach(() => {
    rmSync(dir, { force: true, recursive: true });
  });

  function writeTestCase(testCase: string) {
    writeFileSync(path.join(dir, "recordings.log"), testCase, "utf-8");
  }

  it("should handle source map events before createRecording", async () => {
    writeTestCase(`
      {"kind":"sourcemapAdded","path":"/Users/ryan/.replay/sourcemap-eabb79b2a92a89eee953c1c052e614ad0ae19cdfafba598576b250d8cadb2140.map","recordingId":"60e36c77-3aad-46d5-902f-cf37bd3bff92","id":"eabb79b2a92a89eee953c1c052e614ad0ae19cdfafba598576b250d8cadb2140","url":"https://devtools-git-2023-11-29-testsuites-nux-1-recordreplay.vercel.app/_next/static/chunks/webpack-2b35d1198a807748.js.map","baseURL":"https://devtools-git-2023-11-29-testsuites-nux-1-recordreplay.vercel.app/_next/static/chunks/webpack-2b35d1198a807748.js.map","targetContentHash":"sha256:eabb79b2a92a89eee953c1c052e614ad0ae19cdfafba598576b250d8cadb2140","targetURLHash":"sha256:126ef596a4efc04607a183402a919a81e4057d7188cdc875746d5b25e3b614fc","targetMapURLHash":"sha256:ff0dccd318786108b6ea2c5824cd4ac5091cb3d5217cb24abb883f742a872f33"}
      {"buildId":"macOS-chromium-20231130-d0df72d13090-718eb1da92df","driverVersion":"linker-macOS-12424-718eb1da92df","id":"60e36c77-3aad-46d5-902f-cf37bd3bff92","kind":"createRecording","timestamp":1701729042262}
      {"id":"60e36c77-3aad-46d5-902f-cf37bd3bff92","kind":"addMetadata","metadata":{"uri":"https://devtools-git-2023-11-29-testsuites-nux-1-recordreplay.vercel.app/team/dzowNDAyOGMwYS05ZjM1LTQ2ZjktYTkwYi1jNzJkMTIzNzUxOTI=/runs/961a049e-a7db-46db-9d0c-c3954626b75e?param=dzowNDAyOGMwYS05ZjM1LTQ2ZjktYTkwYi1jNzJkMTIzNzUxOTI%3D&param=runs"},"timestamp":1701729042262}
      {"id":"60e36c77-3aad-46d5-902f-cf37bd3bff92","kind":"writeStarted","path":"/Users/ryan/.replay/recording-60e36c77-3aad-46d5-902f-cf37bd3bff92.dat","timestamp":1701729042262}
      {"id":"60e36c77-3aad-46d5-902f-cf37bd3bff92","kind":"writeFinished","timestamp":1701729046248}
    `);

    const recordings = readRecordings(dir);
    expect(recordings[0]).not.toBeNull();
    expect(recordings[0].sourcemaps.length).toBe(1);
  });
});
