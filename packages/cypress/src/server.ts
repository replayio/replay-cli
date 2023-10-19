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
    server.listen(
      {
        port: 0,
        host: "0.0.0.0",
      },
      () => {
        const port = (server.address() as AddressInfo).port;
        debug("Listening on %d", port);
        resolve({ server: wss, port });
      }
    );
  });
}
