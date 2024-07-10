import { waitForExitTasks } from "./waitForExitTasks";

export async function exitProcess(code?: number): Promise<never> {
  await waitForExitTasks;

  process.exit(code);
}
