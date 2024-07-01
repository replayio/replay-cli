export function getErrorMessage(e: unknown) {
  return e && typeof e === "object" && "message" in e ? (e.message as string) : "Unknown Error";
}

export function getErrorTags(e: unknown) {
  if (e instanceof Error) {
    return {
      errorMessage: e.message,
      errorStack: e.stack,
      errorName: e.name,
    };
  }

  return { errorMessage: "Unknown Error" };
}
