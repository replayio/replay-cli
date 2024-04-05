export function withResolvers<Type>() {
  let reject: ((reason?: any) => void) | undefined = undefined;
  let rejected = false;
  let rejectedReason: any;

  let resolve: ((value: Type | PromiseLike<Type>) => void) | undefined = undefined;
  let resolved = false;
  let resolvedValue: Type | PromiseLike<Type> | undefined = undefined;

  return {
    promise: new Promise<Type>((...args) => {
      resolve = args[0];
      reject = args[1];

      if (rejected) {
        reject(rejectedReason);
      } else if (resolved) {
        resolve(resolvedValue as Type);
      }
    }),
    resolve: (value: Type | PromiseLike<Type>) => {
      if (resolve) {
        resolve(value);
      } else {
        resolved = true;
        resolvedValue = value;
      }
    },
    reject: (reason?: any) => {
      if (reject) {
        reject(reason);
      } else {
        rejected = true;
        rejectedReason = reason;
      }
    },
  };
}
