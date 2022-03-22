
const path = require("path");

function defer() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function maybeLog(verbose, str) {
  if (verbose) {
    console.log(str);
  }
}

function getDirectory(opts) {
  const home = process.env.HOME || process.env.USERPROFILE;
  return (opts && opts.directory) || process.env.RECORD_REPLAY_DIRECTORY || path.join(home, ".replay");
}

function isValidUUID(str) {
  if (typeof str != "string" || str.length != 36) {
    return false;
  }
  for (let i = 0; i < str.length; i++) {
    if ("0123456789abcdef-".indexOf(str[i]) == -1) {
      return false;
    }
  }
  return true;
}

module.exports = { defer, maybeLog, getDirectory, isValidUUID };
