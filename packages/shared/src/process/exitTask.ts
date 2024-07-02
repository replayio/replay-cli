import { close as finalizeLaunchDarkly } from "../launch-darkly/close";
import { mixpanelAPI } from "../mixpanel/mixpanelAPI";
import { logger } from "../logger";

export type ExitTask = () => Promise<void>;

export const exitTasks: ExitTask[] = [
  finalizeLaunchDarkly,
  () => mixpanelAPI.close(),
  () => logger.close(),
];

export function registerExitTask(exitTask: ExitTask) {
  exitTasks.push(exitTask);
}
