import { timeoutAfter } from "@replay-cli/shared/async/timeoutAfter";
import { close as finalizeLaunchDarkly } from "./launch-darkly/close";
import { getPendingEvents } from "./mixpanel/pendingEvents";

export async function exitProcess(code?: number): Promise<never> {
  await Promise.all([
    finalizeLaunchDarkly(),

    // Wait a short amount of time for pending Mixpanel events to be sent before exiting
    Promise.race([timeoutAfter(500, false), Promise.all(Array.from(getPendingEvents()))]),
  ]);

  process.exit(code);
}
