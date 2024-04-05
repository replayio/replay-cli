import chalk from "chalk";
// @ts-ignore TS types are busted; see github.com/enquirer/enquirer/issues/212
import { MultiSelect } from "bvaughn-enquirer";
import { canUpload } from "./canUpload";
import { printRecordings } from "./printRecordings";
import { LocalRecording } from "./types";

export async function selectRecordings(
  recordings: LocalRecording[],
  options: {
    maxRecordingsToDisplay?: number;
    prompt: string;
    selectionMessage: string;
  }
): Promise<LocalRecording[]> {
  const { maxRecordingsToDisplay, prompt, selectionMessage } = options;

  let isShowingAllRecordings = true;
  if (maxRecordingsToDisplay != null && recordings.length > maxRecordingsToDisplay) {
    isShowingAllRecordings = false;
    recordings = recordings.slice(0, maxRecordingsToDisplay);
  }

  const printedLines = printRecordings(recordings, {
    showHeaderRow: false,
  }).split("\n");

  const select = new MultiSelect(
    {
      choices: recordings.map((recording, index) => ({
        disabled: !canUpload(recording),
        message: printedLines[index],
        value: recording.id,
      })),
      footer: isShowingAllRecordings
        ? undefined
        : chalk.dim(`\nViewing the most recent ${maxRecordingsToDisplay} recordings`),
      hideAfterSubmit: true,
      initial: recordings.map(recording => recording.id),
      message: `${prompt}\n  ${chalk.dim(
        "(↑/↓ to change selection, [space] to toggle, [a] to toggle all)"
      )}\n`,
      name: "numbers",
      styles: {
        // Selected row style
        em: chalk.yellowBright,
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
    console.log(printRecordings(selectedRecordings));

    return selectedRecordings;
  } else {
    return [];
  }
}
