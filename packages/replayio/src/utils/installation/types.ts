// TODO [PRO-720] Consolidate with code in @replay-cli/shared/src/runtime

export type Executable = "darwin:chromium" | "linux:chromium" | "win32:chromium";
export type Platform = "macOS" | "linux" | "windows";

// This CLI only supports Chromium for the time being
export type Runtime = "chromium" | "node";

export type Architecture = "arm" | "x86_64" | "unknown";

export type Release = {
  architecture: Architecture;
  buildFile: string;
  buildId: string;
  platform: Platform;
  releaseFile: string;
  runtime: Runtime;
  time: string;

  // Gecko releases don't have a version string
  version: string | null;
};

export type MetadataJSON = {
  [Key in Runtime]?: {
    buildId: string;
    forkedVersion: string | null;
    installDate: string;
  };
};
