/* Copyright 2020 Record Replay Inc. */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReplaySourcemapUploadWebpackPluginOptions = require("./lib/index.js");

// To make life easier for people not using Babel/TS ESM interop and who
// don't want to have to do `.default` on the required value, wrap the
// default export to make it work for both types.
module.exports = ReplaySourcemapUploadWebpackPluginOptions.default.bind(
  undefined
);
Object.defineProperties(
  module.exports,
  Object.getOwnPropertyDescriptors(ReplaySourcemapUploadWebpackPluginOptions)
);
