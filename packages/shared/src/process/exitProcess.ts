import { exitTasks } from "./exitTask";

export async function exitProcess(code?: number): Promise<never> {
  await Promise.all(exitTasks);

  process.exit(code);
}
