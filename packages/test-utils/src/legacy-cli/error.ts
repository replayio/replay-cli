export function getErrorMessage(e: unknown) {
  return e && typeof e === "object" && "message" in e ? (e.message as string) : "Unknown Error";
}
