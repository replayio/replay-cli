import { readFromCache, writeToCache } from "@replay-cli/shared/cache";
import { getAccessToken } from "@replay-cli/shared/authentication/getAccessToken";
import { getReplayPath } from "@replay-cli/shared/getReplayPath";
import { randomBytes } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import open from "open";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  UnauthorizedError,
} from "@modelcontextprotocol/sdk/client/auth.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type OAuthClientInformationFull,
  type OAuthClientMetadata,
  type OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";
import { program } from "commander";
import { name as packageName, version as packageVersion } from "../../package.json";
import { replayMcpOAuthClientId, replayMcpOAuthRedirectUrl, replayMcpServer } from "../config";

type AuthMode = "auto" | "cli" | "oauth";

type McpOptions = {
  auth: string;
  oauthClientId: string;
  oauthRedirectUrl: string;
  url: string;
};

type NormalizedMcpOptions = Omit<McpOptions, "auth"> & {
  auth: AuthMode;
};

type CachedMcpOAuthDetails = {
  clientId?: string;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  state?: string;
  tokens?: OAuthTokens;
};

const McpOAuthCachePath = getReplayPath("profile", "mcp-oauth.json");

function parseAuthMode(value: string): AuthMode {
  if (value === "auto" || value === "cli" || value === "oauth") {
    return value;
  }

  throw new Error(`Unsupported MCP auth mode "${value}". Expected auto, cli, or oauth.`);
}

program
  .command("mcp")
  .description("Run the Replay MCP server over stdio")
  .option("--auth <mode>", "Authentication mode: auto, cli, or oauth", "auto")
  .option("--oauth-client-id <id>", "Pre-registered MCP OAuth client ID", replayMcpOAuthClientId)
  .option(
    "--oauth-redirect-url <url>",
    "Loopback redirect URL registered for the MCP OAuth client",
    replayMcpOAuthRedirectUrl
  )
  .option("--url <url>", "Replay MCP server URL", replayMcpServer)
  .action((options: McpOptions) => {
    void runMcp(options).catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
  });

async function runMcp(options: McpOptions) {
  const normalizedOptions = {
    ...options,
    auth: parseAuthMode(options.auth),
  };
  const { url } = normalizedOptions;
  const remoteUrl = new URL(url);
  const remoteClient = await connectRemoteClient(remoteUrl, normalizedOptions);

  const remoteCapabilities = remoteClient.getServerCapabilities() ?? {};
  const server = new McpServer(
    {
      name: "replay",
      version: packageVersion,
    },
    {
      capabilities: getLocalCapabilities(remoteCapabilities),
      instructions: remoteClient.getInstructions(),
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, (request, extra) =>
    remoteClient.listTools(request.params, { signal: extra.signal })
  );
  server.setRequestHandler(CallToolRequestSchema, (request, extra) =>
    remoteClient.callTool(request.params, undefined, { signal: extra.signal })
  );

  if (remoteCapabilities.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, (request, extra) =>
      remoteClient.listResources(request.params, { signal: extra.signal })
    );
    server.setRequestHandler(ReadResourceRequestSchema, (request, extra) =>
      remoteClient.readResource(request.params, { signal: extra.signal })
    );
    server.setRequestHandler(ListResourceTemplatesRequestSchema, (request, extra) =>
      remoteClient.listResourceTemplates(request.params, { signal: extra.signal })
    );
  }

  if (remoteCapabilities.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, (request, extra) =>
      remoteClient.listPrompts(request.params, { signal: extra.signal })
    );
    server.setRequestHandler(GetPromptRequestSchema, (request, extra) =>
      remoteClient.getPrompt(request.params, { signal: extra.signal })
    );
  }

  if (remoteCapabilities.completions) {
    server.setRequestHandler(CompleteRequestSchema, (request, extra) =>
      remoteClient.complete(request.params, { signal: extra.signal })
    );
  }

  server.onerror = error => {
    console.error(`Replay MCP stdio error: ${error.message}`);
  };

  let isClosing = false;
  const cleanup = async (exitCode?: number) => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    process.stdin.off("end", handleStdinEnd);

    await Promise.allSettled([server.close(), remoteClient.close()]);

    if (typeof exitCode === "number") {
      process.exit(exitCode);
    }
  };
  const handleSignal = () => {
    void cleanup(0);
  };
  const handleStdinEnd = () => {
    void cleanup(0);
  };

  server.onclose = () => {
    void cleanup(0);
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
  process.stdin.on("end", handleStdinEnd);

  await server.connect(new StdioServerTransport());
}

async function connectRemoteClient(remoteUrl: URL, options: NormalizedMcpOptions): Promise<Client> {
  if (options.auth !== "oauth") {
    const { accessToken } = await getAccessToken();
    if (accessToken) {
      const remoteClient = createRemoteClient();

      try {
        await remoteClient.connect(
          new StreamableHTTPClientTransport(remoteUrl, {
            requestInit: {
              headers: {
                ...getCommonHeaders(),
                Authorization: `Bearer ${accessToken}`,
              },
            },
          })
        );
        return remoteClient;
      } catch (error) {
        await remoteClient.close();

        if (options.auth === "cli" || !isAuthenticationError(error)) {
          throw error;
        }

        console.error("Replay CLI auth was rejected by the MCP server; falling back to MCP OAuth.");
      }
    } else if (options.auth === "cli") {
      throw new Error(
        "Replay MCP requires Replay CLI authentication. Run `replayio login` or set REPLAY_API_KEY."
      );
    }
  }

  return await connectRemoteClientWithOAuth(remoteUrl, options);
}

async function connectRemoteClientWithOAuth(
  remoteUrl: URL,
  options: NormalizedMcpOptions
): Promise<Client> {
  const remoteClient = createRemoteClient();
  const oauthProvider = new ReplayMcpOAuthProvider({
    clientId: options.oauthClientId,
    redirectUrl: options.oauthRedirectUrl,
  });
  let remoteTransport = createOAuthTransport(remoteUrl, oauthProvider);

  try {
    await remoteClient.connect(remoteTransport);
    return remoteClient;
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }

    const authorizationCode = await oauthProvider.waitForAuthorizationCode();
    await remoteTransport.finishAuth(authorizationCode);
    await remoteClient.close();

    remoteTransport = createOAuthTransport(remoteUrl, oauthProvider);
    await remoteClient.connect(remoteTransport);
    return remoteClient;
  }
}

function createRemoteClient() {
  const remoteClient = new Client(
    {
      name: `${packageName}-mcp`,
      version: packageVersion,
    },
    {
      capabilities: {},
    }
  );

  remoteClient.onerror = error => {
    console.error(`Replay MCP remote error: ${error.message}`);
  };

  return remoteClient;
}

function createOAuthTransport(remoteUrl: URL, authProvider: OAuthClientProvider) {
  return new StreamableHTTPClientTransport(remoteUrl, {
    authProvider,
    requestInit: {
      headers: getCommonHeaders(),
    },
  });
}

function getCommonHeaders() {
  return {
    "x-client-info": `${packageName}-mcp/${packageVersion}`,
    "x-replay-source": "replay-cli-mcp",
  };
}

function isAuthenticationError(error: unknown) {
  return (
    error instanceof UnauthorizedError ||
    (error instanceof StreamableHTTPError && error.code === 401)
  );
}

function getLocalCapabilities(remoteCapabilities: ServerCapabilities): ServerCapabilities {
  return {
    completions: remoteCapabilities.completions,
    experimental: remoteCapabilities.experimental,
    prompts: remoteCapabilities.prompts,
    resources: remoteCapabilities.resources,
    tools: remoteCapabilities.tools ?? {},
  };
}

class ReplayMcpOAuthProvider implements OAuthClientProvider {
  readonly clientMetadataUrl = undefined;
  private callbackServer: HttpServer | undefined;
  private callbackPromise: Promise<string> | undefined;

  constructor(
    private readonly config: {
      clientId: string;
      redirectUrl: string;
    }
  ) {}

  get redirectUrl() {
    return this.config.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Replay CLI MCP",
      redirect_uris: [this.config.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile email offline_access",
      token_endpoint_auth_method: "none",
    };
  }

  clientInformation(): OAuthClientInformationFull {
    return {
      ...this.clientMetadata,
      client_id: this.config.clientId,
    };
  }

  tokens() {
    const cache = this.readCache();
    if (cache.clientId !== this.config.clientId) {
      return undefined;
    }

    return cache.tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    this.writeCache({
      ...this.readCache(),
      codeVerifier: undefined,
      state: undefined,
      tokens,
    });
  }

  state() {
    const state = randomBytes(16).toString("hex");
    this.writeCache({ ...this.readCache(), state });
    return state;
  }

  saveCodeVerifier(codeVerifier: string) {
    this.writeCache({ ...this.readCache(), codeVerifier });
  }

  codeVerifier() {
    const codeVerifier = this.readCache().codeVerifier;
    if (!codeVerifier) {
      throw new Error("Missing MCP OAuth PKCE code verifier");
    }
    return codeVerifier;
  }

  discoveryState() {
    return this.readCache().discoveryState;
  }

  saveDiscoveryState(discoveryState: OAuthDiscoveryState) {
    this.writeCache({ ...this.readCache(), discoveryState });
  }

  async redirectToAuthorization(authorizationUrl: URL) {
    await this.startCallbackServer();

    console.error("Replay MCP OAuth required. Opening browser for authorization.");
    console.error(`Using OAuth callback URL: ${this.config.redirectUrl}`);
    console.error(`If the browser does not open, visit: ${authorizationUrl.toString()}`);

    try {
      await open(authorizationUrl.toString());
    } catch (error) {
      console.error(
        `Failed to open browser automatically: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async waitForAuthorizationCode() {
    await this.startCallbackServer();
    return await this.callbackPromise!;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") {
      writeToCache<CachedMcpOAuthDetails>(McpOAuthCachePath, undefined);
      return;
    }

    const cache = this.readCache();
    if (scope === "tokens") {
      cache.tokens = undefined;
    } else if (scope === "verifier") {
      cache.codeVerifier = undefined;
      cache.state = undefined;
    } else if (scope === "discovery") {
      cache.discoveryState = undefined;
    }
    this.writeCache(cache);
  }

  private async startCallbackServer() {
    if (this.callbackPromise) {
      return;
    }

    const redirectUrl = new URL(this.config.redirectUrl);
    const port = Number(redirectUrl.port);
    if (!port) {
      throw new Error(`MCP OAuth redirect URL must include a loopback port: ${redirectUrl}`);
    }

    this.callbackPromise = new Promise((resolve, reject) => {
      this.callbackServer = createServer((request, response) => {
        const requestUrl = new URL(request.url || "/", redirectUrl);
        if (requestUrl.pathname !== redirectUrl.pathname) {
          response.writeHead(404);
          response.end();
          return;
        }

        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code");
        const state = requestUrl.searchParams.get("state");
        const expectedState = this.readCache().state;

        if (error) {
          response.writeHead(400, { "Content-Type": "text/html" });
          response.end("<h1>Replay MCP authorization failed</h1>");
          this.closeCallbackServer();
          reject(new Error(`MCP OAuth authorization failed: ${error}`));
          return;
        }

        if (!code) {
          response.writeHead(400, { "Content-Type": "text/html" });
          response.end(
            "<h1>Replay MCP authorization failed</h1><p>Missing authorization code.</p>"
          );
          this.closeCallbackServer();
          reject(new Error("MCP OAuth callback did not include an authorization code"));
          return;
        }

        if (expectedState && state !== expectedState) {
          response.writeHead(400, { "Content-Type": "text/html" });
          response.end("<h1>Replay MCP authorization failed</h1><p>State mismatch.</p>");
          this.closeCallbackServer();
          reject(new Error("MCP OAuth callback state mismatch"));
          return;
        }

        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<h1>Replay MCP authorization complete</h1><p>You can close this window.</p>");
        this.closeCallbackServer();
        resolve(code);
      });

      this.callbackServer.once("error", reject);
      this.callbackServer.listen(port, redirectUrl.hostname);
    });
  }

  private closeCallbackServer() {
    this.callbackServer?.close();
    this.callbackServer = undefined;
  }

  private readCache() {
    return readFromCache<CachedMcpOAuthDetails>(McpOAuthCachePath) ?? {};
  }

  private writeCache(cache: CachedMcpOAuthDetails) {
    writeToCache<CachedMcpOAuthDetails>(McpOAuthCachePath, {
      ...cache,
      clientId: this.config.clientId,
    });
  }
}
