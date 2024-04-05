import { close } from "./launch-darkly/close";

export async function exitProcess(code?: number) {
  await close();

  process.exit(code);
}
