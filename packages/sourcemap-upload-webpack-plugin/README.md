# @recordreplay/sourcemap-upload-webpack-plugin

Wraps Replay's [sourcemap-upload][1] module in a Webpack plugin so that it
will execute automatically when the Webpack build has completed.

## PluginOptions

The Webpack plugin, which is the default export of this module, exposes all of
the same options as [sourcemap-upload][1], along with some additional:

```typescript
export interface PluginOptions extends UploadOptions {
  // Choose how verbose the plugin should be when logging.
  logLevel?: "quiet" | "normal" | "verbose";

  // Normally failure to upload the sourcemaps will result
  // in a build error. If you'd like to simply warn instead
  // of failing in this case, you can set this to true.
  warnOnFailure?: boolean,
}
```

[1]: https://github.com/recordreplay/sourcemap-upload
