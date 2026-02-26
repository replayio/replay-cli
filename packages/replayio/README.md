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

## Agent command

`replayio` also includes an Anthropic-driven browser agent:

```bash
replayio agent https://youtube.com "find the latest replayio video"
replayio agent --headed https://youtube.com "find the latest replayio video"
replayio agent --url https://youtube.com "find the latest replayio video"
```

The agent opens a browser session, runs an action loop via `replayio browser`, closes the session, uploads the recording, and then posts metadata to your analyze endpoint.
Run mode requires a start URL.
Set `ANTHROPIC_API_KEY` and (optionally) `REPLAY_AGENT_ANALYZE_ENDPOINT`.
It also prints the equivalent deterministic Playwright test generated for the session.
The analyze endpoint is only called when the agent marks the goal as unsuccessful.

Each run is written to `/Users/$USER/.replay/profile/agent-history.json` (or `RECORD_REPLAY_DIRECTORY/profile/agent-history.json`).

### Agent history

```bash
replayio agent history
replayio agent history --json
replayio agent history --limit 50
```

### Output tests from history

```bash
replayio agent history tests --id <run-id>
replayio agent history tests --ids <run-id-1>,<run-id-2>
replayio agent history tests --all
replayio agent history tests --failed
replayio agent history tests --passed
# shorthand:
replayio agent history --failed
```

These commands print test code to stdout so you can pipe it:

```bash
replayio agent history tests --failed | pbcopy
replayio agent history tests --passed > passed-tests.ts
```

## Contributing

Contributing guide can be found [here](contributing.md).
