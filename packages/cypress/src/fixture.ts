import { logger } from "@replay-cli/shared/logger";
import { writeFileSync, appendFileSync, mkdirSync } from "fs";
import path from "path";

function getFixtureFile() {
  return (
    process.env.REPLAY_CYPRESS_FIXTURE_FILE ||
    // TODO [ryanjduffy] - This assumes we're running in dist directory and
    // walks back up to put the fixture.log near driver.ts. This would be a
    // weird default if we asked users to run this so this logic should be
    // smarter.
    path.resolve(__filename, "../../tests/fixtures/fixture.log")
  );
}

export function initFixtureFile() {
  logger.info("CypressReporter:InitFixtureFile", {
    updateFixture: process.env.REPLAY_CYPRESS_UPDATE_FIXTURE,
  });
  if (process.env.REPLAY_CYPRESS_UPDATE_FIXTURE) {
    logger.info("CypressReporter:InitFixtureFile", { fixtureFile: getFixtureFile() });
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
