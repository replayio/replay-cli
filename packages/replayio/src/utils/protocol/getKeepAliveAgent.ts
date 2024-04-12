import { AgentOptions, Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

// when dropping support for node 18 it should be possible to rely on the global agent
// since node 20 it's already configured with keepAlive:
// https://github.com/nodejs/node/blob/ee4fa77624f17c1958dac47fddbe7d9513b9dee8/lib/_http_agent.js#L557
const keepAliveOptions: AgentOptions = { keepAlive: true, scheduling: "lifo", timeout: 5000 };
const httpAgent = new HttpAgent(keepAliveOptions);
const httpsAgent = new HttpsAgent(keepAliveOptions);

export function getKeepAliveAgent(url: URL) {
  return ["wss:", "https:"].includes(url.protocol) ? httpsAgent : httpAgent;
}
