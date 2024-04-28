import { Box, Text, render, useInput, useStdout } from "ink";
import { useEffect, useRef } from "react";
import { launchBrowser } from "replayio";
import { FlexBox } from "../../components/FlexBox.js";
import { FullScreen } from "../../components/Fullscreen.js";
import { useExitSignal } from "../../hooks/useExitSignal.js";
import { RecordingsTable } from "./RecordingsTable.js";
import { Recording } from "./types.js";
import { uploadRecording } from "./uploadRecording.js";
import { useRecordings } from "./useRecordings.js";

export function watch() {
  render(<App />);
}

function App() {
  const recordings = useRecordings();
  const stdout = useStdout();

  const stateRef = useRef<{
    uploadedRecordingIds: Set<string>;
    recordings: Recording[];
  }>({
    uploadedRecordingIds: new Set(),
    recordings,
  });

  const { beforeExit, exit, exitSignal } = useExitSignal();

  // Listen for any key press to start exit process
  useInput(beforeExit, {
    isActive: exitSignal === null,
  });

  // Auto-open Replay browser on start
  useEffect(() => {
    launchBrowser("about:blank", {
      onQuit: beforeExit,
      silent: true,
    });
  }, []);

  // Auto-upload newly finished recordings
  useEffect(() => {
    let numUnfinishedRecordings = 0;

    const { uploadedRecordingIds } = stateRef.current;
    recordings.forEach(recording => {
      switch (recording.status) {
        case "recorded": {
          if (!uploadedRecordingIds.has(recording.id)) {
            uploadedRecordingIds.add(recording.id);
            uploadRecording(recording);

            numUnfinishedRecordings++;
          }
          break;
        }
        case "recording":
        case "uploading": {
          numUnfinishedRecordings++;
          break;
        }
      }
    });

    if (exitSignal === "beforeExit") {
      if (numUnfinishedRecordings === 0) {
        exit();
      }
    }

    stateRef.current.recordings = recordings;
  }, [exit, recordings, stdout]);

  useEffect(() => {
    if (exitSignal === "exit") {
      process.exit(0);
    }
  }, [exitSignal]);

  const Wrapper = exitSignal === "exit" ? Box : FullScreen;

  return (
    <Wrapper>
      <FlexBox direction="column">
        <Text>{"New recordings\n"}</Text>
        <RecordingsTable recordings={recordings} />
        {recordings.length === 0 ? (
          <Text dimColor>{"Open a website to make a new recording"}</Text>
        ) : exitSignal === "beforeExit" ? (
          <Text dimColor>{"\nWaiting for uploads to finish..."}</Text>
        ) : (
          <Text dimColor>{"\nPress any key to stop recording"}</Text>
        )}
      </FlexBox>
    </Wrapper>
  );
}
