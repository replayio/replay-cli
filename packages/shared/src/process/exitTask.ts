import { close as finalizeLaunchDarkly } from "../launch-darkly/close";
import { close as finalizeMixPanel } from "../mixpanel/close";

export type ExitTask = () => Promise<void>;

export const exitTasks: ExitTask[] = [finalizeLaunchDarkly, finalizeMixPanel];

export function registerExitTask(exitTask: ExitTask) {
  exitTasks.push(exitTask);
}
