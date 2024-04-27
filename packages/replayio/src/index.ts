import ProtocolClient from "./utils/protocol/ProtocolClient";

export { formatDuration } from "./utils/date";
export { getBrowserPath } from "./utils/browser/getBrowserPath";
export { launchBrowser } from "./utils/browser/launchBrowser";
export { removeFromDisk } from "./utils/recordings/removeFromDisk";
export { formatRecording } from "./utils/recordings/formatRecording";
export { getRecordings } from "./utils/recordings/getRecordings";
export { uploadRecording } from "./utils/recordings/upload/uploadRecording";

export { ProtocolClient };

export type { LocalRecording } from "./utils/recordings/types";
