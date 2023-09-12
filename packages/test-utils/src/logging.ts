export function log(message: string) {
  console.log("[replay.io]:", message);
}

export function warn(message: string, e: unknown) {
  console.warn("[replay.io]:", message);
  if (e instanceof Error) {
    console.warn("[replay.io]: Error:", e.message);
  }
}
