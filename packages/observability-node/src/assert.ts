export function assert(v: any, why = "", tags?: Record<string, unknown>) {
  if (!v) {
    const error = new Error(`Assertion Failed: ${why}`);
    error.name = "AssertionFailed";
    (error as any).tags = tags;

    throw error;
  }
}
