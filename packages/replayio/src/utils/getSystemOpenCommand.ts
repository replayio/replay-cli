export function getSystemOpenCommand() {
  switch (process.platform) {
    case "darwin":
      return "open";
    case "linux":
      return "xdg-open";
    case "win32":
      return "start";
    default:
      throw new Error("Unsupported platform");
  }
}
