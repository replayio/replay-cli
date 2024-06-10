---
"@replayio/sourcemap-upload": patch
"@replayio/sourcemap-upload-webpack-plugin": patch
---

Add support for deleting sourcemaps after they are uploaded, and correlating sourcemaps by filename + `.map` extension if no `sourceMappingURL` exists in the generated file.
