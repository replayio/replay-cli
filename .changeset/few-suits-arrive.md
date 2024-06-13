---
"@replayio/playwright": patch
"@replayio/test-utils": patch
---

Added new `upload` options:

- `statusThreshold`: this accepts one of `'all'`, `'failed-and-flaky'` or `'failed'` and it's used to skip uploading recordings for test runs that don't satisfy the desired threshold (eg. it allows to filter out recordings of passed tests)
- `minimizeUploads`: a boolean flag that helps to minimize the amount of uploaded recordings. With this flag a minimal set of recordings associated with a retried test is uploaded
