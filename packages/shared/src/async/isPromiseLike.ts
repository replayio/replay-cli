export function isPromiseLike<Type>(value: any): value is PromiseLike<Type> {
  return value && typeof value.then === "function";
}
