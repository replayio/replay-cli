import { RecordingData } from "@replayio/protocol";
import { sanitizeMetadata } from "../metadata/sanitizeMetadata.js";
import { LocalRecording } from "../types.js";

export async function validateRecordingMetadata(recording: LocalRecording): Promise<{
  metadata: Object;
  recordingData: RecordingData;
}> {
  const {
    duration,
    id,
    metadata: { host, uri, ...rest },
  } = recording;

  const metadata = await sanitizeMetadata(rest);

  return {
    metadata,
    recordingData: {
      duration: duration ?? 0,
      id,
      url: uri ?? "",
      title: host ?? "",
      // This info is only set for Gecko recordings
      // github.com/replayio/replay-cli/commit/6d9b8b95a3a55eb9a0aa0721199242cfaf319356#r140608348
      operations: {
        scriptDomains: [],
      },
      lastScreenData: "",
      lastScreenMimeType: "",
    },
  };
}
