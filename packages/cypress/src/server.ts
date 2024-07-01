import { logger } from "@replay-cli/shared/logger";
import http from "http";
import { AddressInfo } from "net";
import { WebSocketServer } from "ws";

export async function createServer() {
  logger.info("CypressPlugin:CreatingServer");

  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", function upgrade(request, socket, head) {
    logger.info("CypressPlugin:UpgradeRequest");
    wss.handleUpgrade(request, socket, head, function done(ws) {
      logger.info("CypressPlugin:Upgraded");
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

    logger.info("CypressPlugin:ServerConfig", { config });

    server.listen(config, () => {
      const { address, port } = server.address() as AddressInfo;
      logger.info("CypressPlugin:Listening", { address, port });
      resolve({ server: wss, port });
    });
  });
}
