import { WebSocket } from "ws";

async function globalSetup(config) {
  globalThis.WebSocket = WebSocket;

  const { http, passthrough, ws } = await import("msw");
  const { setupServer } = await import("msw/node");

  const server = setupServer(
    http.post("*", async ({ request }) => {
      const body = await request.text();
      console.log({ body });
      return passthrough();
    }),
    http.get("*", async ({ request }) => passthrough())
  );

  const api = ws.link("wss://dispatch.replay.io");
  const result = api.on("connection", ({ client, server }) => {
    server.connect();

    client.addEventListener("message", event => {
      console.log("sending ws", event.data);
      // server.send(event.data); // event.preventDefault()
    });
  });
  server.use(result);

  // Start the interception.
  server.listen();
}

export default globalSetup;
