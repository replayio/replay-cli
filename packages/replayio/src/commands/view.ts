import { spawn } from "child_process";
import { registerCommand } from "../utils/commander";
import { exitProcess } from "../utils/exitProcess";
import { getSystemOpenCommand } from "../utils/getSystemOpenCommand";

registerCommand("view <id>").description("Upload one or more recordings").action(view);

async function view(id: string) {
  const url = `https://app.replay.io/recording/${id}`;

  spawn(getSystemOpenCommand(), [url]);

  await exitProcess(0);
}
