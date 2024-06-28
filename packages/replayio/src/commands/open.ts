import { exitProcess } from "@replay-cli/shared/process/exitProcess";
import { killBrowserIfRunning } from "../utils/browser/killBrowserIfRunning";
import { launchBrowser } from "../utils/browser/launchBrowser";
import { registerCommand } from "../utils/commander/registerCommand";

registerCommand("open", { checkForRuntimeUpdate: true, requireAuthentication: true })
  .argument("[url]", `URL to open (default: "about:blank")`)
  .description("Open the replay browser with recording disabled")
  .action(open)
  .allowUnknownOption();

async function open(url: string = "about:blank") {
  await killBrowserIfRunning();

  await launchBrowser(url, { record: false });

  await exitProcess(0);
}
