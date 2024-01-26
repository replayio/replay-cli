import dbg from "debug";
import http from "http";
import { AddressInfo } from "net";
import { WebSocketServer } from "ws";

const debug = dbg("replay:cypress:server");

export async function createServer() {
  debug("Creating websocket server");

  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", function upgrade(request, socket, head) {
    debug("Upgrading request");
    wss.handleUpgrade(request, socket, head, function done(ws) {
      debug("Upgraded");
      wss.emit("connection", ws, request);
    });
  });

  return new Promise<{ server: WebSocketServer; port: number }>(resolve => {
    const config = {
      // Pick any available port unless set by user
      port: process.env.CYPRESS_REPLAY_SOCKET_PORT
        ? Number.parseInt(process.env.CYPRESS_REPLAY_SOCKET_PORT)
        : 0,
      // Explicitly use ipv4 unless set by user
      host: process.env.CYPRESS_REPLAY_SOCKET_HOST || "0.0.0.0",
    };

    debug("Server config: %o", config);

    server.listen(config, () => {
      const { address, port } = server.address() as AddressInfo;
      debug("Listening on %s on port %d", address, port);
      resolve({ server: wss, port });
    });
  });
}
