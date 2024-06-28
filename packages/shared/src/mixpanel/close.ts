import { timeoutAfter } from "../async/timeoutAfter";
import { getPendingEvents } from "./pendingEvents";

export async function close() {
  // Wait a short amount of time for pending Mixpanel events to be sent before exiting
  await Promise.race([timeoutAfter(500, false), Promise.all(Array.from(getPendingEvents()))]);
}
