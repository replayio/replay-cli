---
"replayio": minor
"@replayio/cypress": minor
"@replayio/jest": minor
"@replayio/playwright": minor
"@replayio/puppeteer": minor
---

Add streamed recording upload (`REPLAY_STREAMED_UPLOAD=1`, or `--streamed-upload` for `replayio record` and `replayio upload`): recordings are uploaded while they are being recorded. Uploads that get a new server recording ID (e.g. `--no-presigned`) keep their local recording entry.
