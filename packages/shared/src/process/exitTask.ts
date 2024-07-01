import { close as finalizeLaunchDarkly } from "../launch-darkly/close";
import { close as finalizeMixPanel } from "../mixpanel/close";
import { logger } from "../logger";

export type ExitTask = () => Promise<void>;

export const exitTasks: ExitTask[] = [finalizeLaunchDarkly, finalizeMixPanel, () => logger.close()];

export function registerExitTask(exitTask: ExitTask) {
  exitTasks.push(exitTask);
}
