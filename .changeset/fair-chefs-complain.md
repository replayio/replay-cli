---
"@replayio/cypress": minor
---

Added a new `upload.statusThreshold` option. It accepts one of `'all'`, `'failed-and-flaky'` or `'failed'` and it's used to skip uploading recordings for test runs that don't satisfy the desired threshold (eg. it allows to filter out recordings of passed tests).
