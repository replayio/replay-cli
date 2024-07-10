import { launchDarklyClient } from "../launchDarklylient";
import { logger } from "../logger";
import { mixpanelClient } from "../mixpanelClient";
import { ExitTask } from "./types";

export const exitTasks: ExitTask[] = [
  () => launchDarklyClient.close(),
  () => mixpanelClient.close(),
  () => logger.close(),
];
