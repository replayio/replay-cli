import { getReplayPath } from "../getReplayPath";

export const authClientId = process.env.REPLAY_AUTH_CLIENT_ID || "4FvFnJJW4XlnUyrXQF8zOLw6vNAH1MAo";
export const authHost = process.env.REPLAY_AUTH_HOST || "webreplay.us.auth0.com";
export const cachedAuthPath = getReplayPath("profile", "auth.json");
