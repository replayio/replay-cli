import { Text, render, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import { launchBrowser } from "replayio";
import { FlexBox } from "../../components/FlexBox.js";
import { FullScreen } from "../../components/Fullscreen.js";
import { RecordingsTable } from "./RecordingsTable.js";
import { Recording } from "./types.js";
import { uploadRecording } from "./uploadRecording.js";
import { useRecordings } from "./useRecordings.js";

export function watch() {
  render(<App />);
}

type ExitSignal = "beforeExit" | "exit";

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

  const [exitSignal, setExitSignal] = useState<ExitSignal | null>(null);

  // Listen for any key press to start exit process
  useInput(() => setExitSignal("beforeExit"), {
    isActive: exitSignal === null,
  });

  // Auto-open Replay browser on start
  useEffect(() => {
    launchBrowser("about:blank", {
      onQuit: () => {
        setExitSignal("beforeExit");
      },
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
        setExitSignal("exit");
      }
    }

    stateRef.current.recordings = recordings;
  }, [recordings, stdout]);

  useEffect(() => {
    if (exitSignal === "exit") {
      process.exit(0);
    }
  }, [exitSignal]);

  let children = (
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
  );

  if (exitSignal !== "exit") {
    children = <FullScreen>{children}</FullScreen>;
  }

  return children;
}
