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

## Browser facade

`replayio` exposes Playwright CLI under the `browser` command:

```bash
replayio browser open https://google.com
replayio browser click "text=Sign in"
replayio browser close
```

`@playwright/cli` is launched with Replay Browser through `PLAYWRIGHT_MCP_EXECUTABLE_PATH`.
You can override the Playwright CLI binary with `REPLAYIO_PLAYWRIGHT_CLI_PATH`.

When `replayio browser close` succeeds, replayio deterministically prints:

- a generated Playwright test assembled from captured `### Ran Playwright code` blocks
- a numbered step list derived from the captured actions

Recordings for the closed browser session are also auto-uploaded when authenticated (`replayio login` or `REPLAY_API_KEY`).

## Contributing

Contributing guide can be found [here](contributing.md).
