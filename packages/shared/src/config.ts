export const replayApiServer = process.env.REPLAY_API_SERVER || "https://api.replay.io";
export const replayAppHost = process.env.REPLAY_APP_SERVER || "https://app.replay.io";
export const replayWsServer =
  process.env.RECORD_REPLAY_SERVER || process.env.REPLAY_SERVER || "wss://dispatch.replay.io";

const isCI = !!process.env.CI;
const isDebugging = !!process.env.DEBUG;
const isTTY = process.stdout.isTTY;

export const disableAnimatedLog = isCI || isDebugging || !isTTY;

export const disableMixpanel = isCI || process.env.NODE_ENV === "test";
export const mixpanelToken =
  process.env.REPLAY_MIXPANEL_TOKEN || "ffaeda9ef8fb976a520ca3a65bba5014";
