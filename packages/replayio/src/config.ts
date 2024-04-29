export const replayApiServer = process.env.REPLAY_API_SERVER || "https://api.replay.io";
export const replayAppHost = process.env.REPLAY_APP_SERVER || "https://app.replay.io";
export const replayWsServer =
  process.env.RECORD_REPLAY_SERVER || process.env.REPLAY_SERVER || "wss://dispatch.replay.io";

const isCI = !!process.env.CI;
const isDebugging = !!process.env.DEBUG;

export const disableAnimatedLog = isCI || isDebugging;
