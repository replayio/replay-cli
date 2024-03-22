import { writeFileSync, appendFileSync, mkdirSync } from "fs";
import path from "path";
import dbg from "debug";

const debug = dbg("replay:cypress:fixture");

function getFixtureFile() {
  return (
    process.env.REPLAY_CYPRESS_FIXTURE_FILE ||
    // TODO [ryanjduffy] - This assumes we're running in dist/src directory and
    // walks back up to put the fixture.log near driver.ts. This would be a
    // weird default if we asked users to run this so this logic should be
    // smarter.
    path.resolve(__filename, "../../tests/fixtures/fixture.log")
  );
}

export function initFixtureFile() {
  debug("REPLAY_CYPRESS_UPDATE_FIXTURE: %s", process.env.REPLAY_CYPRESS_UPDATE_FIXTURE);
  if (process.env.REPLAY_CYPRESS_UPDATE_FIXTURE) {
    debug("Initializing fixture file %s", getFixtureFile());
    try {
      mkdirSync(path.dirname(getFixtureFile()), { recursive: true });
      writeFileSync(getFixtureFile(), "");
    } catch (e) {
      console.error(e);
      process.env.REPLAY_CYPRESS_UPDATE_FIXTURE = undefined;
    }
  }
}

export function appendToFixtureFile(type: string, value: any) {
  if (process.env.REPLAY_CYPRESS_UPDATE_FIXTURE) {
    try {
      appendFileSync(getFixtureFile(), JSON.stringify({ type, value }) + "\n");
    } catch (e) {
      console.error(e);
      process.env.REPLAY_CYPRESS_UPDATE_FIXTURE = undefined;
    }
  }
}
