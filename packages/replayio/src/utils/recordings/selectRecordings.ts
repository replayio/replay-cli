// @ts-ignore TS types are busted; see github.com/enquirer/enquirer/issues/212
import { MultiSelect } from "bvaughn-enquirer";
import { dim, highlight, transparent } from "../theme";
import { printRecordings } from "./printRecordings";
import { LocalRecording } from "./types";

export async function selectRecordings(
  recordings: LocalRecording[],
  options: {
    defaultSelected?: (recording: LocalRecording) => boolean;
    disabledSelector?: (recording: LocalRecording) => boolean;
    maxRecordingsToDisplay?: number;
    noSelectableRecordingsMessage?: string;
    prompt: string;
    selectionMessage: string;
  }
): Promise<LocalRecording[]> {
  const {
    defaultSelected = () => true,
    disabledSelector = () => false,
    maxRecordingsToDisplay = 25,
    noSelectableRecordingsMessage,
    prompt,
    selectionMessage,
  } = options;

  let isShowingAllRecordings = true;
  if (maxRecordingsToDisplay != null && recordings.length > maxRecordingsToDisplay) {
    isShowingAllRecordings = false;
    recordings = recordings.slice(0, maxRecordingsToDisplay);
  }

  const printedLines = printRecordings(recordings, {
    showHeaderRow: false,
  }).split("\n");

  const enabledRecordings = recordings.filter(recording => !disabledSelector(recording));
  if (enabledRecordings.length === 0) {
    if (noSelectableRecordingsMessage) {
      console.log(noSelectableRecordingsMessage);
    }
    return [];
  }

  const select = new MultiSelect(
    {
      choices: recordings.map((recording, index) => {
        const disabled = disabledSelector(recording);
        const message = printedLines[index];

        return {
          disabled,
          hint: "",
          message: disabled ? transparent(message) : message,
          value: recording.id,
        };
      }),
      footer: isShowingAllRecordings
        ? undefined
        : dim(`\nViewing the most recent ${maxRecordingsToDisplay} recordings`),
      hideAfterSubmit: true,
      initial: recordings.filter(defaultSelected).map(recording => recording.id),
      message: `${prompt}\n  ${dim(
        "(↑/↓ to change selection, [space] to toggle, [a] to toggle all)"
      )}\n`,
      name: "numbers",
      styles: {
        // Selected row style
        em: highlight,
      },
    },
    (choices: any[]) => {
      return choices.map(choice => choice.value);
    }
  );

  const recordingIds = (await select.run()) as string[];

  if (recordingIds.length > 0) {
    const selectedRecordings = recordings.filter(recording => recordingIds.includes(recording.id));
    console.log(selectionMessage);
    console.log(printRecordings(selectedRecordings, { showHeaderRow: false }));

    return selectedRecordings;
  } else {
    return [];
  }
}
