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

  const [signal, setSignal] = useState<"ready" | "finalize" | "exit">("ready");

  useInput(() => setSignal("finalize"), {
    isActive: signal === "ready",
  });

  useEffect(() => {
    launchBrowser("about:blank", {
      onQuit: () => {
        setSignal("finalize");
      },
      silent: true,
    });
  }, []);

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

    if (signal === "finalize") {
      if (numUnfinishedRecordings === 0) {
        setSignal("exit");
      }
    }

    stateRef.current.recordings = recordings;
  }, [recordings, stdout]);

  useEffect(() => {
    if (signal === "exit") {
      process.exit(0);
    }
  }, [signal]);

  let children = (
    <FlexBox direction="column">
      <Text>{"New recordings\n"}</Text>
      <RecordingsTable recordings={recordings} />
      {recordings.length === 0 ? (
        <Text dimColor>{"Open a website to make a new recording"}</Text>
      ) : signal === "finalize" ? (
        <Text dimColor>{"\nWaiting for uploads to finish..."}</Text>
      ) : (
        <Text dimColor>{"\nPress any key to stop recording"}</Text>
      )}
    </FlexBox>
  );

  if (signal !== "exit") {
    children = <FullScreen>{children}</FullScreen>;
  }

  return children;
}
