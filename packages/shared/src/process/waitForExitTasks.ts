import { exitTasks } from "./exitTask";

export async function waitForExitTasks() {
  await Promise.all(exitTasks.map(task => task()));
}
