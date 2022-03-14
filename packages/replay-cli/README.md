# recordings-cli

CLI tool and node module for managing and uploading [Replay](https://replay.io) recordings.

## Overview

When using the Replay versions of node, playwright, or puppeteer, recordings which are created are saved to disk, by default in `$HOME/.replay`.  This package is used to manage these recordings and upload them to the record/replay web service so that they can be viewed.

## Installation

`npm i @recordreplay/recordings-cli --global`

## Usage

`replay-recordings <command>`

Possible commands are given below.  These may be used with the `--directory <dir>` option to override the default recording directory, or `--server <address>` to override the default server address.  When uploading, an API key is required, which can be passed via `--api-key <key>` or by setting the `RECORD_REPLAY_API_KEY` environment variable.

### ls

View information about all known recordings.  Prints a JSON array with one descriptor element for each recording.  Recording descriptors have the following required properties:

* `id`: ID used to refer to this recording in other commands.
* `createTime`: Time when the recording was created.
* `runtime`: Runtime used to create the recording: either `gecko`, `chromium`, or `node`.
* `metadata`: Any information the runtime associated with this recording.  For gecko/chromium recordings this is the URI of the first page loaded, and for node recordings this is the original command line arguments.
* `status`: Status of the recording, see below for possible values.

The possible status values for a recording are as follows:

* `onDisk`: The recording was fully written out to disk.
* `uploaded`: The recording was fully uploaded to the record/replay web service.
* `startedWrite`: The recording started being written to disk but wasn't finished.  Either the recording process is still running, or the recording process was killed and didn't shut down normally.
* `startedUpload`: The recording started being uploaded but didn't finish.
* `unusable`: The recording was marked as unusable for some reason, such as a stack overflow occurring.
* `crashed`: The recording process crashed before finishing.
* `crashUploaded`: The recording process crashed and the crash data was uploaded to the record/replay web service for analysis.

Depending on the status the recording descriptor can have some of the following additional properties:

* `path`: If the recording started being written to disk (including before being uploaded), the path to the recording file.
* `server`: If the recording started being uploaded, the address of the server it was uploaded to.
* `recordingId`: If the recording started being uploaded, the server-assigned ID for this recording which can be used to view it.
* `unusableReason`: If the recording is unusable, the reason it was marked unusable.

### upload <id>

Upload the recording with the given ID to the web service.

### process <id>

Upload a recording, and then process it to ensure it can be replayed successfully.

### upload-all

Upload all recordings to the web service which can be uploaded.

### view <id>

View the the given recording in the system's default browser, uploading it first if necessary.

### view-latest

View the most recently created recording in the system's default browser, uploading it first if necessary.

### rm <id>

Remove the recording with the given ID and any on disk file for it.

### rm-all

Remove all recordings and on disk recording files.

### update-browsers

Updates any installed browsers used for recording in automation: [playwright](https://www.npmjs.com/package/@recordreplay/playwright), [puppeteer](https://www.npmjs.com/package/@recordreplay/puppeteer), and [cypress](https://www.npmjs.com/package/@recordreplay/cypress).

## Node Module Usage

This package can be used as a node module to directly access its functionality rather than going through the CLI tool.

Installation:

```
npm i @recordreplay/recordings-cli
```

Usage:

```
const interface = require("@recordreplay/recordings-cli");
```

The interface includes the following members.  Options objects can include `directory`, `server`, and `apiKey` properties which behave the same as `--directory`, `--server`, and `--api-key` arguments to the CLI tool, and a `verbose` property which can be set to log the same output as the CLI tool.  Any of these properties or the options object themselves can be omitted to use default values.

### listAllRecordings(opts)

Equivalent to `replay-recordings ls`, returns the JSON object for the recordings.

### uploadRecording(id, opts)

Equivalent to `replay-recordings upload <id>`, returns a promise that resolves with a recording ID if the upload succeeded, or null if uploading failed.

### processRecording(id, opts)

Equivalent to `replay-recordings process <id>`, returns a promise that resolves with a recording ID if the upload and processing succeeded, or null if either failed.

### uploadAllRecordings(opts)

Equivalent to `replay-recordings upload-all`, returns a promise that resolves with whether all uploads succeeded.

### viewRecording(id, opts)

Equivalent to `replay-recordings view <id>`, returns a promise that resolves with whether the recording is being viewed.

### viewLatestRecording(opts)

Equivalent to `replay-recordings view-latest`, returns a promise that resolves with whether the latest recording is being viewed.

### removeRecording(id, opts)

Equivalent to `replay-recordings rm <id>`, returns whether the recording was removed.

### removeAllRecordings(opts)

Equivalent to `replay-recordings rm-all`.

### updateBrowsers(opts)

Equivalent to `replay-recordings update-browsers`.
