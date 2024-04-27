import { Text, render, useInput } from "ink";
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

  const stateRef = useRef<{
    uploadedRecordingIds: Set<string>;
    recordings: Recording[];
  }>({
    uploadedRecordingIds: new Set(),
    recordings,
  });

  const [shouldQuit, setShouldQuit] = useState(false);

  useInput(() => setShouldQuit(true));

  useEffect(() => {
    launchBrowser("about:blank", {
      onQuit: () => {
        setShouldQuit(true);
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

    if (shouldQuit) {
      if (numUnfinishedRecordings === 0) {
        process.exit(0);
      }
    }

    stateRef.current.recordings = recordings;
  }, [recordings]);

  return (
    <FullScreen>
      <FlexBox direction="column">
        <Text>{"New recordings\n"}</Text>
        <RecordingsTable recordings={recordings} />
        {shouldQuit ? (
          <Text dimColor>{"Waiting for uploads to finish..."}</Text>
        ) : recordings.length === 0 ? (
          <Text dimColor>{"Open a website to make a new recording"}</Text>
        ) : (
          <Text dimColor>{"\nPress any key to stop recording"}</Text>
        )}
      </FlexBox>
    </FullScreen>
  );
}
