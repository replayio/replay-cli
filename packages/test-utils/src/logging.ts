export function log(message: string) {
  message.split("\n").forEach(m => console.log("[replay.io]:", m));
}

export function warn(message: string, e?: unknown) {
  console.warn("[replay.io]:", message);
  if (e && e instanceof Error) {
    console.warn("[replay.io]: Error:", e.message);
  }
}
