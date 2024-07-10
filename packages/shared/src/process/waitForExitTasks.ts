import { exitTasks } from "./exitTasks";

export async function waitForExitTasks() {
  await Promise.all(exitTasks.map(task => task()));
}
