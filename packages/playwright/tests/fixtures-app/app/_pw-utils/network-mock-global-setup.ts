import type { FullConfig } from "@playwright/test";
import type {
  addOriginalSourceResult,
  addSourceMapResult,
  beginRecordingUploadParameters,
  beginRecordingUploadResult,
  endRecordingUploadResult,
  existsResult,
  setAccessTokenResult,
  setRecordingMetadataResult,
} from "@replayio/protocol";
import { WebSocket } from "undici";

async function globalSetup(_config: FullConfig) {
  (globalThis as any).WebSocket = WebSocket;

  const { http, ws, HttpResponse } = await import("msw");
  const { setupServer } = await import("msw/node");

  const server = setupServer(
    http.get("*", async ({ request }) => {
      switch (request.url) {
        case "https://dispatch.replay.io/": {
          return new HttpResponse("", {
            status: 200,
          });
        }
        default:
          throw new Error(`Unexpected GET to: ${request.url}`);
      }
    }),
    http.post("*", async ({ request }) => {
      switch (request.url) {
        case "https://api.replay.io/v1/graphql": {
          const body = JSON.parse(await request.text());

          switch (body.name) {
            case "AddTestsToShard":
              // TODO: we are interested in the data that we sent out here
              return new HttpResponse(JSON.stringify({}));
            case "CompleteTestRunShard":
              return new HttpResponse(JSON.stringify({}));
            case "CreateTestRunShard":
              return new HttpResponse(
                JSON.stringify({
                  data: {
                    startTestRunShard: {
                      testRunShardId: "test-run-shard-id",
                    },
                  },
                })
              );
            default:
              throw new Error(`Unexpected graphql operation name: ${body.name}`);
          }
        }
        case "https://webhooks.replay.io/api/metrics":
          return new HttpResponse(JSON.stringify({}));
        default:
          throw new Error(`Unexpected POST to: ${request.url}`);
      }
    }),
    http.put("*", async ({ request }) => {
      if (request.url.startsWith("https://app.replay.io/recording/")) {
        return new HttpResponse(JSON.stringify({}));
      }
      throw new Error(`Unexpected PUT to: ${request.url}`);
    })
  );

  const wsHandler = ws.link("wss://dispatch.replay.io").on("connection", ({ client, server }) => {
    server.connect();

    client.addEventListener("message", event => {
      event.preventDefault();
      const data = JSON.parse(String(event.data));
      switch (data.method) {
        case "Authentication.setAccessToken":
        case "Internal.endRecordingUpload":
        case "Internal.setRecordingMetadata":
        case "Recording.addOriginalSource":
        case "Recording.addSourceMap":
        case "Resource.exists":
          client.send(
            JSON.stringify({
              id: data.id,
              result: {} satisfies
                | addOriginalSourceResult
                | addSourceMapResult
                | endRecordingUploadResult
                | existsResult
                | setAccessTokenResult
                | setRecordingMetadataResult,
            })
          );
          return;
        case "Internal.beginRecordingUpload": {
          const params: beginRecordingUploadParameters = data.params;
          client.send(
            JSON.stringify({
              id: data.id,
              result: {
                recordingId: params.recordingId!,
                uploadLink: `https://app.replay.io/recording/${params.recordingId}`,
              } satisfies beginRecordingUploadResult,
            })
          );
          return;
        }
        default:
          throw new Error(`Unexpected protocol method: ${data.method}`);
      }
    });
  });

  server.use(wsHandler);

  server.listen();
}

export default globalSetup;
