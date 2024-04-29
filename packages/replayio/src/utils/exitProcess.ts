import { close } from "./launch-darkly/close.js";

export async function exitProcess(code?: number): Promise<never> {
  await close();

  process.exit(code);
}
