# @replayio/replay

CLI tool and Node module for managing and uploading [Replay](https://replay.io) recordings and installing Replay Browsers.

## Overview

When using the Replay plugins to record automated tests or the Replay version of Node, recordings which are created are saved to disk, by default in `$HOME/.replay`. This package is used to manage these recordings and upload them to the record/replay web service so that they can be viewed.

**Check out the ["Recording Automated Tests Guide"](https://docs.replay.io/docs/recording-automated-tests-5bf7d91b65cd46deab1867b07bd12bdf) to get started with recording Cypress or Playwright tests.**

## Installation

`npm i @replayio/replay --global`

## Usage

```bash
npx @replayio/replay <command>
```

Possible commands are given below. These may be used with the `--directory <dir>` option to override the default recording directory, or `--server <address>` to override the default server address. When uploading, an API key is required, which can be passed via `--api-key <key>` or by setting the `RECORD_REPLAY_API_KEY` environment variable.

### ls

View information about all known recordings.

Options:

- `--all`: Include `uploaded`, `crashUploaded` and `unusable` recordings in the output.
- `--filter`: Filter the recordings to upload using a [JSONata-compatible filter function](https://docs.jsonata.org/higher-order-functions#filter). If used with `--all`, the filter is applied after including all status values.
- `--json`: Prints a JSON array with one descriptor element for each recording.

Recording descriptors have the following required properties:

- `id`: ID used to refer to this recording in other commands.
- `createTime`: Time when the recording was created.
- `runtime`: Runtime used to create the recording: either `gecko`, `chromium`, or `node`.
- `metadata`: Any information the runtime associated with this recording. For gecko/chromium recordings this is the URI of the first page loaded, and for node recordings this is the original command line arguments.
- `status`: Status of the recording, see below for possible values.

The possible status values for a recording are as follows:

- `onDisk`: The recording was fully written out to disk.
- `uploaded`: The recording was fully uploaded to the record/replay web service.
- `startedWrite`: The recording started being written to disk but wasn't finished. Either the recording process is still running, or the recording process was killed and didn't shut down normally.
- `startedUpload`: The recording started being uploaded but didn't finish.
- `unusable`: The recording was marked as unusable for some reason, such as a stack overflow occurring.
- `crashed`: The recording process crashed before finishing.
- `crashUploaded`: The recording process crashed and the crash data was uploaded to the record/replay web service for analysis.

Depending on the status the recording descriptor can have some of the following additional properties:

- `path`: If the recording started being written to disk (including before being uploaded), the path to the recording file.
- `server`: If the recording started being uploaded, the address of the server it was uploaded to.
- `recordingId`: If the recording started being uploaded, the server-assigned ID for this recording which can be used to view it.
- `unusableReason`: If the recording is unusable, the reason it was marked unusable.

### upload `<id>`

Upload the recording with the given ID to the web service.

### process `<id>`

Upload a recording, and then process it to ensure it can be replayed successfully.

### upload-all

Upload all recordings to the web service which can be uploaded.

Options:

- `--filter`: Filter the recordings to upload using a [JSONata-compatible filter function](https://docs.jsonata.org/higher-order-functions#filter)

### view `<id>`

View the the given recording in the system's default browser, uploading it first if necessary.

### view-latest

View the most recently created recording in the system's default browser, uploading it first if necessary.

### rm `<id>`

Remove the recording with the given ID and any on disk file for it.

### rm-all

Remove all recordings and on disk recording files.

### update-browsers

Updates any installed browsers used for recording in automation: [playwright](https://www.npmjs.com/package/@replayio/playwright), [puppeteer](https://www.npmjs.com/package/@replayio/puppeteer), and [cypress](https://www.npmjs.com/package/@replayio/cypress).

### upload-sourcemaps

Allows uploading production sourcemaps to Replay's servers so that they can be used when viewing recordings.

The CLI command `replay upload-sourcemaps [opts] <paths...>` has the following options:

- `<paths>`: (Required) A set of files or directories to search for generated files and sourcemap files.
- `--group`: (Required) To allow for tracking and browsing of maps that have been uploaded, we
  require uploaded names to have an overall group name associated with them.
  This could for instance be a version number, or commit hash.
- `--api-key`: The API key to use when connecting to Replay's servers.
  Defaults to `process.env.RECORD_REPLAY_API_KEY`.
- `--root`: Set the directory that relative paths should be computed with respect to. The relative path
  of sourcemaps is included in the uploaded entry, and will be visible in the uploaded-asset UI, so this
  can be used to strip off unimportant directories in the build path. Defaults to `process.cwd()`.
- `--ignore`: Provide an ignore pattern for files to ignore when searching for sourcemap-related data.
  This may be passed multiple times to ignore multiple things.
- `--quiet`: Tell the CLI to output nothing to stdout. Errors will still log to stderr.
- `--verbose`: Output additional information about the sourcemap map search.
- `--dry-run`: Run all of the local processing and searching for maps, but skip uploading them.
- `--extensions`: The comma-separated set of file extensions to search for sourcemap-related data.
  Defaults to `".js,.map"`.

To programmatically upload from a node script, use [`@replayio/sourcemap-upload`](https://www.npmjs.com/package/@replayio/sourcemap-upload).

### metadata

Sets metadata on local recordings. With no options, this command will add the provided `metadata` to each local recording.

```
# Sets the provided x-build metadata and attempts to generate the source
# metadata from relevant environment variables
replay metadata --init '{"x-build": {"id": 1234}}' --keys source --warn
```

The CLI command `replay metadata [opts]` has the following options:

- `--init <metadata>`: Initializes the metadata object from the provided JSON-formatted `metadata` string
- `--keys <space separated metadata key names>`: Initializes known metadata keys by retrieving values from environment variables.
- `--warn`: Warn instead of exit with an error when metadata cannot be initialized
- `--filter`: Filter the recordings to which the metadata is applied using a [JSONata-compatible filter function](https://docs.jsonata.org/higher-order-functions#filter)

## Node Module Usage

This package can be used as a node module to directly access its functionality rather than going through the CLI tool.

Installation:

```bash
npm i @replayio/replay
```

Usage:

```js
const interface = require("@replayio/replay");
```

The interface includes the following members. Options objects can include `directory`, `server`, and `apiKey` properties which behave the same as `--directory`, `--server`, and `--api-key` arguments to the CLI tool, and a `verbose` property which can be set to log the same output as the CLI tool. Any of these properties or the options object themselves can be omitted to use default values.

### listAllRecordings(opts)

Equivalent to `replay ls`, returns the JSON object for the recordings.

### uploadRecording(id, opts)

Equivalent to `replay upload <id>`, returns a promise that resolves with a recording ID if the upload succeeded, or null if uploading failed.

### processRecording(id, opts)

Equivalent to `replay process <id>`, returns a promise that resolves with a recording ID if the upload and processing succeeded, or null if either failed.

### uploadAllRecordings(opts)

Equivalent to `replay upload-all`, returns a promise that resolves with whether all uploads succeeded.

### viewRecording(id, opts)

Equivalent to `replay view <id>`, returns a promise that resolves with whether the recording is being viewed.

### viewLatestRecording(opts)

Equivalent to `replay view-latest`, returns a promise that resolves with whether the latest recording is being viewed.

### removeRecording(id, opts)

Equivalent to `replay rm <id>`, returns whether the recording was removed.

### removeAllRecordings(opts)

Equivalent to `replay rm-all`.

### updateBrowsers(opts)

Equivalent to `replay update-browsers`.

## Contributing

Contributing guide can be found [here](contributing.md).
