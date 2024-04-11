export type UpdateCheckFailed = {
  hasUpdate: undefined;
};

export type UpdateCheckResult<Version> = {
  hasUpdate: boolean | undefined;
  fromVersion: Version | undefined;
  shouldShowPrompt: boolean;
  toVersion: Version;
};

export type UpdateCheck<Version> = UpdateCheckFailed | UpdateCheckResult<Version>;

// Bun doesn't provide a way to query info about a package so we'll ignore it
export type PackageManager = "npm" | "pnpm" | "yarn";
