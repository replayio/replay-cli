export type Executable = "darwin:chromium" | "linux:chromium" | "win32:chromium";
export type Platform = "macOS" | "linux" | "windows";

// This CLI only supports Chromium for the time being
export type Runtime = "chromium" | "node";

export type Release = {
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
  chromium: {
    buildId: string;
    installDate: string;
  };
};
