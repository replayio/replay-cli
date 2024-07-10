import { launchDarklyClient } from "../launchDarklylient";
import { logger } from "../logger";
import { mixpanelClient } from "../mixpanelClient";

export type ExitTask = () => Promise<void>;

export const exitTasks: ExitTask[] = [
  () => launchDarklyClient.close(),
  () => mixpanelClient.close(),
  () => logger.close(),
];

export function registerExitTask(exitTask: ExitTask) {
  exitTasks.push(exitTask);
}
