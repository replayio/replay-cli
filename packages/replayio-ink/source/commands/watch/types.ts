import { LocalRecording } from "replayio";

export type RecordingStatus =
  | "recorded"
  | "recording"
  | "recording-failed"
  | "uploading"
  | "uploading-failed"
  | "uploaded";

export type Recording = {
  duration: number;
  id: string;
  localRecording: LocalRecording;
  shortId: string;
  status: RecordingStatus;
  title: string;
  shortLink?: string;
};
