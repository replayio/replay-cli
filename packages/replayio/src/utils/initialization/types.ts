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
