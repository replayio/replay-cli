import {
  setInterval as setIntervalPromise,
  setTimeout as setTimeoutPromise,
} from "node:timers/promises";

const original = {
  clearInterval: globalThis.clearInterval,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  setTimeout: globalThis.setTimeout,
};

type TimeoutOrIntervalId = NodeJS.Timeout | string | number;

const intervals: Set<string> = new Set();
const timeouts: Set<string> = new Set();

function clearInterval(timeout: TimeoutOrIntervalId | undefined): void {
  if (timeout) {
    intervals.delete("" + timeout);
  }
  original.clearInterval(timeout);
}

function clearTimeout(timeout: TimeoutOrIntervalId | undefined): void {
  if (timeout) {
    timeouts.delete("" + timeout);
  }
  original.clearTimeout(timeout);
}

function setInterval(callback: (args: void) => void, ms?: number): NodeJS.Timeout {
  const timeout = original.setInterval(callback, ms);
  intervals.add("" + timeout);
  timeout.unref();
  return timeout;
}
setInterval.__promisify__ = setIntervalPromise;

function setTimeout(callback: (args: void) => void, ms?: number): NodeJS.Timeout {
  const timeout = original.setTimeout(callback, ms);
  timeouts.add("" + timeout);
  timeout.unref();
  return timeout;
}
setTimeout.__promisify__ = setTimeoutPromise;

export function clearAllIntervals() {
  intervals.forEach(timeout => {
    clearInterval(timeout);
  });
}

export function clearAllTimeouts() {
  timeouts.forEach(timeout => {
    clearTimeout(timeout);
  });
}

globalThis.clearInterval = clearInterval;
globalThis.clearTimeout = clearTimeout;
globalThis.setInterval = setInterval;
globalThis.setTimeout = setTimeout;
