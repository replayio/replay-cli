import { existsSync } from "fs";
import install from "./install";

if (!process.env.REPLAY_SKIP_BROWSER_DOWNLOAD && existsSync("dist")) {
  console.log("Installing Replay browsers for cypress");
  install("all").then(
    () => {
      console.log("Done");
    },
    error => {
      console.error(error);
    }
  );
}
