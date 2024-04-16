import { existsSync } from "fs";
import install from "./install";

if (
  !process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD &&
  !process.env.REPLAY_SKIP_BROWSER_DOWNLOAD &&
  existsSync("dist")
) {
  console.log("Installing Replay browsers for playwright");
  install("all").then(
    () => {
      console.log("Done");
    },
    error => {
      console.error(error);
    }
  );
}
