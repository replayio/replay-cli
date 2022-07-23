// FIXME common up with packages/replay/src/client.ts

import WebSocket from "ws";
import { defer } from "./utils";
import {
  CommandMethods,
  CommandParams,
  CommandResult,
} from "@replayio/protocol";

// Simple protocol client for use in writing standalone applications.

interface Callbacks {
  onOpen: (socket: WebSocket) => void;
  onClose: (socket: WebSocket) => void;
  onError: (socket: WebSocket) => void;
}

class ProtocolClient {
  socket: WebSocket;
  callbacks: Callbacks;
  pendingMessages = new Map();
  eventListeners = new Map();
  nextMessageId = 1;

  constructor(address: string, callbacks: Callbacks) {
    this.socket = new WebSocket(address);
    this.callbacks = callbacks;

    this.socket.on("open", callbacks.onOpen);
    this.socket.on("close", callbacks.onClose);
    this.socket.on("error", callbacks.onError);
    this.socket.on("message", message => this.onMessage(message));
  }

  close() {
    this.socket.close();
  }

  async setAccessToken(accessToken?: string) {
    accessToken = accessToken || process.env.RECORD_REPLAY_API_KEY;

    if (!accessToken) {
      throw new Error(
        "Access token must be passed or set via the RECORD_REPLAY_API_KEY environment variable."
      );
    }

    return this.sendCommand("Authentication.setAccessToken", {
      accessToken,
    });
  }

  async sendCommand<M extends CommandMethods>(
    method: M,
    params: CommandParams<M>,
    sessionId?: string,
    pauseId?: string
  ): Promise<CommandResult<M>> {
    const id = this.nextMessageId++;
    this.socket.send(
      JSON.stringify({
        id,
        method,
        params,
        sessionId,
        pauseId,
      })
    );
    const waiter = defer<CommandResult<M>>();
    this.pendingMessages.set(id, { method, stack: Error().stack, waiter });
    return waiter.promise;
  }

  setEventListener(method: string, callback: (params: any) => void) {
    this.eventListeners.set(method, callback);
  }

  onMessage(contents: WebSocket.RawData) {
    const msg = JSON.parse(String(contents));
    if (msg.id) {
      const { method, stack, waiter } = this.pendingMessages.get(msg.id);
      this.pendingMessages.delete(msg.id);
      if (msg.result) {
        waiter.resolve(msg.result);
      } else {
        waiter.reject(`Error in message ${method}: ${JSON.stringify(msg)} Stack ${stack}`);
      }
    } else if (this.eventListeners.has(msg.method)) {
      this.eventListeners.get(msg.method)(msg.params);
    } else {
      console.log(`Received event without listener: ${msg.method}`);
    }
  }
}

export default ProtocolClient;
