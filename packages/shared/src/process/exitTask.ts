import { close as finalizeLaunchDarkly } from "../launch-darkly/close";
import { mixpanelAPI } from "../mixpanel/mixpanelAPI";

export type ExitTask = () => Promise<void>;

export const exitTasks: ExitTask[] = [finalizeLaunchDarkly, () => mixpanelAPI.close()];

export function registerExitTask(exitTask: ExitTask) {
  exitTasks.push(exitTask);
}
