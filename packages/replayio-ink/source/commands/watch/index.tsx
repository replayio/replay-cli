import chalk from "chalk";
import { Text, render } from "ink";
import { useEffect, useMemo, useRef } from "react";
import { launchBrowser } from "replayio";
import { FlexBox } from "../../components/FlexBox.js";
import { FullScreen } from "../../components/Fullscreen.js";
import { useInputKey } from "../../hooks/useInputKey.js";
import { DraftRecordings } from "./DraftRecordings.js";
import { UploadedRecordings } from "./UploadedRecordings.js";
import { Recording } from "./types.js";
import { uploadRecording } from "./uploadRecording.js";
import { useRecordings } from "./useRecordings.js";

export function watch() {
  // TODO Listen for PID; close when it closes (and close it when we close)
  launchBrowser("about:blank", { silent: true });

  render(<Watch />);
}

function Watch() {
  useInputKey(key => {
    switch (key) {
      case "escape": {
        process.exit(0);
      }
    }
  });

  const recordings = useRecordings();

  const stateRef = useRef<{
    uploadedRecordingIds: Set<string>;
  }>({
    uploadedRecordingIds: new Set(),
  });

  const { draftRecordings, uploadedRecordings } = useMemo(() => {
    const draftRecordings: Recording[] = [];
    const uploadedRecordings: Recording[] = [];

    recordings.forEach(recording => {
      if (recording.status === "uploaded") {
        uploadedRecordings.push(recording);
      } else {
        draftRecordings.push(recording);
      }
    });

    return { draftRecordings, uploadedRecordings };
  }, [recordings]);

  useEffect(() => {
    const { uploadedRecordingIds } = stateRef.current;
    recordings.forEach(recording => {
      if (recording.status === "recorded") {
        if (!uploadedRecordingIds.has(recording.id)) {
          uploadedRecordingIds.add(recording.id);
          uploadRecording(recording);
        }
      }
    });
  }, [recordings]);

  return (
    <FullScreen>
      <FlexBox direction="column">
        <DraftRecordings recordings={draftRecordings} />
        <UploadedRecordings recordings={uploadedRecordings} />
        {recordings.length > 0 ? (
          <Text>{chalk.dim("\nWhen you're done recording, press Escape to quit")}</Text>
        ) : null}
      </FlexBox>
    </FullScreen>
  );
}
