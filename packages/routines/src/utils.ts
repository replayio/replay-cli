// FIXME common up with packages/replay/src/utils.ts

export function defer<T = unknown>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: any) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function maybeLog(verbose: boolean | undefined, str: string) {
  if (verbose) {
    console.log(str);
  }
}
