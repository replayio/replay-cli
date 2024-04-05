import { AgentOptions, Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { replayServer } from "../../config";
import { Agent } from "./types";

export function createHttpAgent(agentOptions: AgentOptions): Agent {
  const serverURL = new URL(replayServer);

  if (["wss:", "https:"].includes(serverURL.protocol)) {
    return new HttpsAgent(agentOptions);
  } else if (["ws:", "http:"].includes(serverURL.protocol)) {
    return new HttpAgent(agentOptions);
  }

  throw new Error(`Unsupported protocol: ${serverURL.protocol} for URL ${serverURL}`);
}
