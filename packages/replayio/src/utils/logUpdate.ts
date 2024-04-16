import logUpdateExternal, { LogUpdate } from "log-update";
import { disableAnimatedLog } from "../config";

function logUpdateDebugging(...text: string[]) {
  console.log(...text);
}
logUpdateDebugging.clear = (() => {}) satisfies LogUpdate["clear"];
logUpdateDebugging.done = (() => {}) satisfies LogUpdate["done"];

// log-update interferes with verbose DEBUG output
export const logUpdate = disableAnimatedLog ? (logUpdateDebugging as LogUpdate) : logUpdateExternal;
