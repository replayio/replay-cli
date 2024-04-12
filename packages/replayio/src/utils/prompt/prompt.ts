export async function prompt({
  abortSignal,
}: {
  abortSignal?: AbortSignal;
} = {}): Promise<boolean> {
  return new Promise(resolve => {
    const stdin = process.stdin;
    const prevRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function destroy() {
      stdin.off("data", onData);
      stdin.setRawMode(prevRaw);
      stdin.setEncoding();

      if (abortSignal) {
        abortSignal.removeEventListener("abort", destroy);
      }
    }

    function onData(data: string) {
      destroy();

      switch (data) {
        case "\n":
        case "\r":
          resolve(true);
          break;
        case "\x03":
          // \x03 is Ctrl+C (aka "End of text")
          // https://donsnotes.com/tech/charsets/ascii.html
          process.exit(0);
        default:
          resolve(false);
          break;
      }
    }

    stdin.on("data", onData);

    if (abortSignal) {
      abortSignal.addEventListener("abort", destroy);
    }
  });
}
