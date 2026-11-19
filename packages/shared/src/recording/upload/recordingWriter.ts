import { execFile } from "child_process";
import { readFile, readdir, readlink, realpath } from "fs/promises";

// The recorder holds its recording file open for writing until it has written
// `writeFinished` (or died), so an open writer is what says more data can come.

export const streamedUploadSupported =
  process.platform === "linux" || process.platform === "darwin";

const O_ACCMODE = 0o3;
const O_RDONLY = 0o0;

export async function isOpenForWriting(path: string): Promise<boolean> {
  switch (process.platform) {
    case "linux":
      return isOpenForWritingLinux(await realpath(path));
    case "darwin":
      return isOpenForWritingDarwin(path);
    default:
      throw new Error(`Unsupported platform "${process.platform}"`);
  }
}

// Last writer found per file; checking it is cheap, scanning all processes is not
const knownWriters = new Map<string, { pid: string; fd: string }>();

async function isOpenForWritingLinux(path: string) {
  const known = knownWriters.get(path);
  if (known && (await isWriterFd(path, known.pid, known.fd))) {
    return true;
  }
  knownWriters.delete(path);

  for (const pid of await readdir("/proc")) {
    if (!/^\d+$/.test(pid)) {
      continue;
    }
    // Processes exit and other users' processes are unreadable while scanning
    const fds = await readdir(`/proc/${pid}/fd`).catch(() => []);
    for (const fd of fds) {
      if (await isWriterFd(path, pid, fd)) {
        knownWriters.set(path, { pid, fd });
        return true;
      }
    }
  }
  return false;
}

async function isWriterFd(path: string, pid: string, fd: string) {
  const target = await readlink(`/proc/${pid}/fd/${fd}`).catch(() => undefined);
  if (target !== path) {
    return false;
  }
  const fdInfo = await readFile(`/proc/${pid}/fdinfo/${fd}`, "utf8").catch(() => "");
  return fdInfoHasWriteAccess(fdInfo);
}

export function fdInfoHasWriteAccess(fdInfo: string) {
  const flags = fdInfo.match(/^flags:\s*([0-7]+)$/m)?.[1];
  return flags !== undefined && (parseInt(flags, 8) & O_ACCMODE) !== O_RDONLY;
}

function isOpenForWritingDarwin(path: string) {
  return new Promise<boolean>((resolve, reject) => {
    execFile("lsof", ["-F", "a", "--", path], (error, stdout) => {
      // lsof exits with 1 when no process has the file open
      if (error && error.code !== 1) {
        reject(error);
      } else {
        resolve(lsofOutputHasWriter(stdout));
      }
    });
  });
}

// `lsof -F a` prints one `a<mode>` line per open file; `w` and `u` include write access
export function lsofOutputHasWriter(output: string) {
  return output.split("\n").some(line => line.startsWith("a") && /[wu]/.test(line));
}
