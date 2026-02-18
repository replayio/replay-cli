import { ProxyAgent, setGlobalDispatcher } from "undici";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { Agent } from "http";

export function getProxyUrl(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy
  );
}

/**
 * Sets undici's global dispatcher to route all fetch() calls through the proxy.
 * Should be called once at process startup before any network calls.
 */
export function initUndiciProxy() {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
}

/**
 * Returns an HTTP agent for use with the `ws` WebSocket library,
 * or undefined if no proxy is configured.
 */
export function getWebSocketProxyAgent(): Agent | undefined {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    return new HttpsProxyAgent(proxyUrl);
  }
  return undefined;
}
