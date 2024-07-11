function maybeLogToConsole(verbose: boolean | undefined, str: string) {
  if (verbose) {
    console.log(str);
  }
}

export { maybeLogToConsole };
