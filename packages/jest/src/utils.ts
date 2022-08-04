import { ChildProcess, spawnSync } from "child_process";

function defer<T = unknown>(): {
  promise: Promise<T>;
  resolve: undefined | ((value: T) => void);
  reject: undefined | ((reason?: any) => void);
} {
  let resolve = undefined;
  let reject = undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function waitForProcessExit(childProcess: ChildProcess) {
  const exitWaiter = defer<{ code: number | null; signal: NodeJS.Signals | null }>();
  childProcess.on(
    "exit",
    (code, signal) => exitWaiter.resolve && exitWaiter.resolve({ code, signal })
  );
  return exitWaiter.promise;
}

function findExecutablePath(executable: string) {
  const { stdout } = spawnSync("which", [executable], { stdio: "pipe" });
  const path = stdout.toString().trim();
  return path.length ? path : null;
}

export { waitForProcessExit, findExecutablePath };
