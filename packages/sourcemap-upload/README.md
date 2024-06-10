# @replayio/sourcemap-upload

Provides an NPM library allows uploading sourcemaps to Replay's servers so
that they can be used when viewing recordings.

## Usage

This module will search the given filepaths for JS files and sourcemap files,
and then it will use the `file` field of the sourcemap or the `//# sourceMappingURL=`
comments in the JS to find pairs of sourcemap and JS file.

## Debugging

If no sourcemaps are being found, consider running the function with verbose
mode enabled, or with `DEBUG=replay:sourcemap-upload` set in the environment.

Most likely, if sourcemaps are not being found, they either:

- have no `file` property referencing their associated JS file
- the generated file has `//# sourceMappingURL=`

Either of these links is sufficient, so if changing the generated code to include a
`//# sourceMappingURL=` comment is not what you want, including `file` is enough,
and vice-versa.

## API

This module exports a named `uploadSourceMaps` function with the following options:

```typescript
export interface UploadOptions {
  /**
   * The files/directories to search for sourcemaps. All files that match the
   * 'extensions' list and fail to match 'ignore' will be searched for
   * sourcemap JSON or `//#sourceMappingURL=` coments in order to find pairs
   * of generated-file + sourcemap, and the sourcemap will be uploaded.
   */
  filepaths: Array<string> | string;
  /**
   * To allow for tracking and browsing of maps that have been uploaded, we
   * require uploaded sourcemaps to have an overall group name associated with
   * them. This could for instance be a version number, or commit hash.
   */
  group: string;
  /**
   * The API key to use when connecting to Replay's servers.
   * Defaults to `process.env.REPLAY_API_KEY`.
   */
  key?: string;
  /**
   * Run all of the local processing and searching for maps, but skip uploading them.
   */
  dryRun?: boolean;
  /**
   * Delete all found sourcemap files after they have been uploaded.
   */
  deleteAfterUpload?: boolean;
  /**
   * If sourcemaps can't be matched to generated files by their sourceMappingURL, try matching by filenames on disk
   */
  matchSourcemapsByFilename?: boolean;
  /**
   * The set of file extensions to search for sourcemap-related data.
   * Defaults to [".js", ".map"].
   */
  extensions?: Array<string>;
  /**
   * The set of pattern for files to ignore when searching for sourcemap-related data.
   */
  ignore?: Array<string>;
  /**
   * Set the directory that relative paths should be computed with respect to.
   * The relative path of sourcemaps is included in the uploaded entry, and will be
   * visible in the UI, so this can be used to strip off unimportant directories in
   * the build path. Defaults to `process.cwd()`.
   */
  root?: string;
  /**
   * A callback function that will be called with log messages.
   */
  log?: LogCallback;
  /**
   * URL of the Replay server to upload to. Defaults to `https://api.replay.io`.
   */
  server?: string;
  /**
   * The number of concurrent uploads to perform. Defaults to 25.
   */
  concurrency?: number;
  /**
   * A string to append to the User-Agent header when making requests to the Replay API.
   */
  userAgentAddition?: string;
}
```
