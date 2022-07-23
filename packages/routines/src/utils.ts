// FIXME common up with packages/replay/src/utils.ts

export function assert(v: any, why: string = "") {
  if (!v) {
    throw new Error(`Assertion failed: ${why}`);
  }
}

export function defer<T = unknown>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: any) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function log(str: string) {
  console.log(new Date, str);
}
