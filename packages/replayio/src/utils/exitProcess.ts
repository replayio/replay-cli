import { close } from "./launch-darkly/close";

export async function exitProcess(code?: number): Promise<never> {
  await close();

  process.exit(code);
}
