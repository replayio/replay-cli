import { existsSync } from "fs";
import install from "./install";

if (!process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD && existsSync("dist")) {
  console.log("Installing Replay browsers for puppeteer");

  install().then(
    () => {
      console.log("Done");
    },
    error => {
      console.error(error);
    }
  );
}
