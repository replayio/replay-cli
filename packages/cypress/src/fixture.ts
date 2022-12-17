import { writeFileSync, appendFileSync, mkdirSync } from "fs";
import path from "path";

function getFixtureFile() {
  return path.resolve(__filename, "../../../tests/fixtures/fixture.log");
}

export function initFixtureFile() {
  if (process.env.REPLAY_UPDATE_FIXTURE) {
    try {
      mkdirSync(path.dirname(getFixtureFile()));
      writeFileSync(getFixtureFile(), "");
    } catch (e) {
      console.error(e);
      process.env.REPLAY_UPDATE_FIXTURE = undefined;
    }
  }
}

export function appendToFixtureFile(type: string, value: any) {
  if (process.env.REPLAY_UPDATE_FIXTURE) {
    try {
      appendFileSync(getFixtureFile(), JSON.stringify({ type, value }) + "\n");
    } catch (e) {
      console.error(e);
      process.env.REPLAY_UPDATE_FIXTURE = undefined;
    }
  }
}
