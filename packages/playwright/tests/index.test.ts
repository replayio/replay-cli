import cp from "child_process";
import path from "path";
import fs from "fs";

const fixturesPages = path.join(__dirname, "fixtures-app", "app");
const playwrightPath = cp.spawnSync("yarn", ["bin", "playwright"]).stdout.toString().trim();

fs.readdirSync(fixturesPages).forEach(name => {
  if (name.startsWith("_") || !fs.statSync(path.join(fixturesPages, name)).isDirectory()) {
    return;
  }
  it(name, async () => {
    await new Promise<void>((resolve, reject) => {
      const child = cp.spawn("node", [playwrightPath, "test", "--project", "replay-chromium"], {
        cwd: path.join(fixturesPages, name),
        stdio: "inherit",
        env: {
          ...process.env,
          // so Playwirhgt doesn't think the test was run by Jest. If it sees this env variable it throws an error
          JEST_WORKER_ID: undefined,
        },
      });

      child.on("error", reject);

      child.on("exit", (code, signal) => {
        if (code || signal) {
          if (signal === "SIGTERM") {
            return;
          }
          reject(new Error(`Process failed (${code ? `code: ${code}` : `signal: ${signal}`})`));
        } else {
          resolve();
        }
      });
    });
  });
});
