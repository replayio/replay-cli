import install from "./install";

if (!process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
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
