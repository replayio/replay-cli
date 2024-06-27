"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mixpanelToken = exports.disableMixpanel = exports.disableAnimatedLog = exports.replayWsServer = exports.replayAppHost = exports.replayApiServer = void 0;
// TODO [PRO-720] Remove these in favor of values exported by "shared"
exports.replayApiServer = process.env.REPLAY_API_SERVER || "https://api.replay.io";
exports.replayAppHost = process.env.REPLAY_APP_SERVER || "https://app.replay.io";
exports.replayWsServer = process.env.RECORD_REPLAY_SERVER || process.env.REPLAY_SERVER || "wss://dispatch.replay.io";
const isCI = !!process.env.CI;
const isDebugging = !!process.env.DEBUG;
const isTTY = process.stdout.isTTY;
exports.disableAnimatedLog = isCI || isDebugging || !isTTY;
exports.disableMixpanel = isCI || process.env.NODE_ENV === "test";
exports.mixpanelToken = process.env.REPLAY_MIXPANEL_TOKEN || "ffaeda9ef8fb976a520ca3a65bba5014";
