# replayio

CLI tool for creating and uploading [Replay](https://replay.io) recordings.

## Installation

```bash
npm install --global replayio
```

## Usage

To see all available commands, run:

```bash
replayio
```

For help on a specific command, use the `help` command:

```bash
replayio help list
```

This CLI will automatically prompt you to log into your Replay account (or to register one). You can use an `REPLAY_API_KEY` environment variable for authentication instead if you prefer.

The CLI will also prompt you to download the Replay runtime if you have not already done so.

## MCP

The CLI can run Replay's MCP server over stdio using your existing Replay CLI authentication:

```json
{
  "mcpServers": {
    "replay": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "replayio", "mcp"]
    }
  }
}
```

The command tries existing Replay CLI authentication first, using `replayio login` or
`REPLAY_API_KEY`. If no CLI token is available, it falls back to MCP OAuth using a
stable pre-registered client ID and PKCE.

The HTTP endpoint can be overridden with `REPLAY_MCP_SERVER` or `replayio mcp --url <url>`.
The OAuth client can be overridden with `REPLAY_MCP_OAUTH_CLIENT_ID`, and the loopback
callback can be overridden with `REPLAY_MCP_OAUTH_REDIRECT_URL`. The default OAuth
callback is `http://127.0.0.1:42813/callback` and must be registered for the client.

## Contributing

Contributing guide can be found [here](contributing.md).
