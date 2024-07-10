import { exitTasks } from "./exitTasks";
import { ExitTask } from "./types";

export function registerExitTask(exitTask: ExitTask) {
  exitTasks.push(exitTask);
}
