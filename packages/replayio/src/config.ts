export const graphQLServer = process.env.REPLAY_API_SERVER || "https://api.replay.io";
export const isDebugging = !!process.env.DEBUG;
export const replayAppHost = process.env.REPLAY_APP_SERVER || "https://app.replay.io";
export const replayServer =
  process.env.RECORD_REPLAY_SERVER || process.env.REPLAY_SERVER || "wss://dispatch.replay.io";
