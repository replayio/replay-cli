### Replay/Playwright Example

This directory contains a single example Playwright test, which can be run with `yarn run test`.

### Confirming That Your Test Was Recorded

Congratulations! You just recorded your first test with Replay! If you run `npx @replayio/replay ls` you should see an entry describing the details of the recording you just made. Mine looks like this:

```
[
  {
    "id": 1146850316,
    "createTime": "Tue Mar 15 2022 15:27:55 GMT-0700 (Pacific Daylight Time)",
    "runtime": "gecko",
    "metadata": {
      "title": "Replay of localhost:3000",
      "uri": "http://localhost:3000/"
    },
    "status": "onDisk",
    "path": "/Users/josh/.replay/recording-1146850316.dat"
  }
]
```

### Uploading Your Replay

You can now upload that replay by copying it's id and passing that as an argument to `npx @replayio/replay upload`, like this:

```
npx @replayio/replay upload 1146850316
```

\*Don't forget to set your `RECORD_REPLAY_API_KEY`, which can be created from the settings panel of `app.replay.io`.

If all goes well you should see something like the following output:

```
Starting upload for 1146850316...
Created remote recording 884d0a6a-78e2-4762-bcd7-b96dd649c0d3, uploading...
Setting recording metadata for 884d0a6a-78e2-4762-bcd7-b96dd649c0d3
Upload finished! View your Replay at: https://app.replay.io/recording/884d0a6a-78e2-4762-bcd7-b96dd649c0d3
```

You can now review that test run in Replay!

### Todo List

- Talk about automatically uploading things via the GitHub action.
- Add a playwright/test setup for a simple Next.js App
- Add Replay's Playwright Test Adapter
- Add GH Comments which list the new replay recordings
