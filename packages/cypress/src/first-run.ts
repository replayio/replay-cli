import install from "./install";

if (!process.env.REPLAY_SKIP_BROWSER_DOWNLOAD) {
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
