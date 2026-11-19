import { appendFileSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { LocalRecording } from "../types";

jest.mock("../../logger");
jest.mock("../../protocol/ProtocolClient");
jest.mock("../../protocol/api/createRecording");
jest.mock("../../protocol/api/addRecordingData");
jest.mock("../../protocol/api/finishRecording");
jest.mock("../../protocol/api/setRecordingMetadata");
jest.mock("../../async/timeoutAfter");
jest.mock("./uploadRecording");
jest.mock("./recordingWriter");

const recordingId = "11111111-1111-4111-8111-111111111111";

describe("streamRecording", () => {
  let dir: string;
  let dataPath: string;
  let sent: Array<{ offset: number; data: string }>;
  let api: {
    createRecording: jest.Mock;
    addRecordingData: jest.Mock;
    finishRecording: jest.Mock;
    setRecordingMetadata: jest.Mock;
    timeoutAfter: jest.Mock;
    uploadRecording: jest.Mock;
    isOpenForWriting: jest.Mock;
  };
  let finish: AbortController;

  // Recorder side: appends recording bytes and log entries
  const write = (data: string) => appendFileSync(dataPath, data);
  const log = (kind: string, extra: object = {}) =>
    appendFileSync(
      join(dir, "recordings.log"),
      JSON.stringify({ id: recordingId, kind, ...extra }) + "\n"
    );

  // Runs one recorder step per poll
  const onPolls = (...steps: Array<() => void>) =>
    api.timeoutAfter.mockImplementation(async () => steps.shift()?.());

  const stream = async () => {
    const { readRecordings } = require("../getRecordings");
    const { streamRecording } = require("./streamRecording");
    const recording: LocalRecording = readRecordings()[0];
    await streamRecording({}, recording, {
      accessToken: "token",
      finish: finish.signal,
    }).catch(() => {});
    return recording;
  };

  beforeEach(() => {
    jest.resetModules();
    dir = mkdtempSync(join(tmpdir(), "stream-recording-"));
    dataPath = join(dir, `recording-${recordingId}.dat`);
    process.env.RECORD_REPLAY_DIRECTORY = dir;

    api = {
      createRecording: require("../../protocol/api/createRecording").createRecording,
      addRecordingData: require("../../protocol/api/addRecordingData").addRecordingData,
      finishRecording: require("../../protocol/api/finishRecording").finishRecording,
      setRecordingMetadata: require("../../protocol/api/setRecordingMetadata").setRecordingMetadata,
      timeoutAfter: require("../../async/timeoutAfter").timeoutAfter,
      uploadRecording: require("./uploadRecording").uploadRecording,
      isOpenForWriting: require("./recordingWriter").isOpenForWriting,
    };
    finish = new AbortController();
    api.isOpenForWriting.mockResolvedValue(true);
    sent = [];
    api.createRecording.mockImplementation(async (_, params) => ({
      recordingId: params.recordingId,
    }));
    api.addRecordingData.mockImplementation(async (_, { offset }, data: Buffer) => {
      sent.push({ offset, data: data.toString() });
      return {};
    });

    writeFileSync(dataPath, "");
    log("createRecording", { buildId: "build" });
    log("addMetadata", { metadata: { uri: "https://www.fake.com/" } });
    log("writeStarted", { path: dataPath });
  });

  it("sends appended data in order and finishes after the recorder finished", async () => {
    write("AB");
    onPolls(() => {
      write("CD");
      log("writeFinished");
    });

    const recording = await stream();

    expect(sent).toEqual([
      { offset: 0, data: "AB" },
      { offset: 2, data: "CD" },
    ]);
    expect(api.setRecordingMetadata).toHaveBeenCalledTimes(1);
    expect(api.finishRecording).toHaveBeenCalledWith(expect.anything(), { recordingId });
    expect(recording.uploadStatus).toBe("uploaded");
  });

  it("does not finish an unusable recording that sent no data", async () => {
    write("AB");
    log("recordingUnusable", { reason: "test" });

    const recording = await stream();

    expect(sent).toEqual([]);
    expect(api.finishRecording).not.toHaveBeenCalled();
    expect(recording.uploadStatus).toBe("failed");
  });

  it("aborts an unusable recording that sent data: not finished, its connection closed", async () => {
    write("AB");
    onPolls(() => log("recordingUnusable", { reason: "test" }));

    const recording = await stream();

    const connection = require("../../protocol/ProtocolClient").default.mock.instances[0];
    expect(sent).toEqual([{ offset: 0, data: "AB" }]);
    expect(api.finishRecording).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(recording.uploadStatus).toBe("failed");
  });

  it("falls back to a regular upload under a new server ID, keeping the local ID", async () => {
    write("AB");
    log("writeFinished");
    api.addRecordingData.mockRejectedValue(new Error("Socket closed"));

    const recording = await stream();

    expect(api.uploadRecording).toHaveBeenCalledTimes(1);
    expect(recording.id).toBe(recordingId);
    expect(recording.serverId).not.toBe(recordingId);
  });

  it("gives up on a recording whose recorder is gone without ending it, without creating it", async () => {
    write("AB");
    api.isOpenForWriting.mockResolvedValue(false);
    onPolls();

    const recording = await stream();

    expect(api.createRecording).not.toHaveBeenCalled();
    expect(api.uploadRecording).not.toHaveBeenCalled();
    expect(recording.uploadStatus).toBe("failed");
  });

  it("waits one poll for `writeFinished` after the recorder closed the file", async () => {
    write("AB");
    api.isOpenForWriting.mockResolvedValue(false);
    onPolls(() => log("writeFinished"));

    const recording = await stream();

    expect(sent).toEqual([{ offset: 0, data: "AB" }]);
    expect(api.finishRecording).toHaveBeenCalledTimes(1);
    expect(recording.uploadStatus).toBe("uploaded");
  });

  it("finishes with the data written so far once `finish` is aborted", async () => {
    write("AB");
    onPolls(() => {
      write("CD");
      finish.abort();
    });

    const recording = await stream();

    expect(sent).toEqual([
      { offset: 0, data: "AB" },
      { offset: 2, data: "CD" },
    ]);
    expect(api.finishRecording).toHaveBeenCalledTimes(1);
    expect(recording.recordingStatus).toBe("recording");
    expect(recording.uploadStatus).toBe("uploaded");
  });
});
