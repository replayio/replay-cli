import { canUpload } from "./canUpload";
import { LocalRecording } from "./types";

function createRecording(recording: Partial<LocalRecording>): LocalRecording {
  return {
    buildId: "build",
    crashData: undefined,
    date: new Date(0),
    driverVersion: "driver",
    duration: undefined,
    id: "id",
    metadata: {
      host: "www.fake.com",
      processGroupId: undefined,
      processType: undefined,
      sourceMaps: [],
      title: undefined,
      uri: undefined,
    },
    path: "recording-id.dat",
    processingStatus: undefined,
    recordingStatus: "finished",
    serverId: "id",
    unusableReason: undefined,
    uploadError: undefined,
    uploadStatus: undefined,
    ...recording,
  };
}

describe("canUpload", () => {
  it("accepts in-progress recordings only for streamed uploads", () => {
    const recording = createRecording({ recordingStatus: "recording" });

    expect(canUpload(recording)).toBe(false);
    expect(canUpload(recording, { streamedUpload: true })).toBe(true);
  });

  it("does not stream in-progress recordings without a host", () => {
    const recording = createRecording({
      recordingStatus: "recording",
      metadata: { ...createRecording({}).metadata, host: undefined },
    });

    expect(canUpload(recording, { streamedUpload: true })).toBe(false);
  });

  it("keeps accepting finished and crashed recordings and rejecting unusable ones", () => {
    expect(canUpload(createRecording({ recordingStatus: "finished" }))).toBe(true);
    expect(canUpload(createRecording({ recordingStatus: "crashed" }))).toBe(true);
    expect(canUpload(createRecording({ recordingStatus: "unusable" }))).toBe(false);
  });
});
