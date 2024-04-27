import { useEffect, useRef, useState } from "react";
import { LocalRecording, getRecordings } from "replayio";
import { getRecordingStatus } from "./getRecordingStatus.js";
import { Recording } from "./types.js";

export function useRecordings(): Recording[] {
  const initialRecordingIdsRef = useRef<Set<string> | null>(null);
  if (initialRecordingIdsRef.current === null) {
    initialRecordingIdsRef.current = new Set(
      getRecordings().map((recording: LocalRecording) => recording.id)
    );
  }

  const [recordings, setRecordings] = useState<Recording[]>([]);

  useEffect(() => {
    const update = () => {
      const recordings: Recording[] = [];

      getRecordings().forEach((recording: LocalRecording) => {
        if (recording.metadata.processType !== "root") {
          // Ignore non-root recordings
          return;
        } else if (!recording.metadata.host) {
          // Ignore new tab recordings (see TT-1036)
          return;
        } else if (initialRecordingIdsRef.current?.has(recording.id)) {
          // Ignore pre-existing recordings
          return;
        }

        recordings.push({
          duration: recording.duration ?? Date.now() - recording.date.getTime(),
          id: recording.id,
          localRecording: recording,
          shortId: recording.id.slice(0, 8),
          status: getRecordingStatus(recording),
          title: recording.metadata.host ?? "(unknown)",
        });
      });

      setRecordings(recordings);
    };

    update();

    const interval = setInterval(update, 1_000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return recordings;
}
