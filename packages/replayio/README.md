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

`replayio` exposes an `agent-browser` facade under the `browser` command:

```bash
replayio browser open https://google.com
replayio browser click "text=Sign in"
replayio browser close
```

`agent-browser` is installed as a dependency and patched to enforce Replay Chrome launch behavior.
On `replayio browser close`, recordings for the closed browser session are automatically uploaded
when you are authenticated (`replayio login` or `REPLAY_API_KEY`).

## Contributing

Contributing guide can be found [here](contributing.md).
