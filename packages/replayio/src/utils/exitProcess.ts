import { clearAllIntervals, clearAllTimeouts } from "./async/overrideSetTimeout";
import { close } from "./launch-darkly/close";

export async function exitProcess(code?: number) {
  clearAllIntervals();
  clearAllTimeouts();

  await close();

  process.exit(code);
}
