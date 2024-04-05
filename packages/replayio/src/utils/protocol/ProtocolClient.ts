import assert from "assert";
import { Agent } from "http";
import WebSocket from "ws";
import { replayServer } from "../../config";
import { getAccessToken } from "../authentication/getAccessToken";
import { Deferred, STATUS_PENDING, createDeferred } from "../createDeferred";
import { ProtocolError } from "./ProtocolError";
import { setAccessToken } from "./api/setAccessToken";
import { debug } from "./debug";

export default class ProtocolClient {
  private deferredAuthenticated = createDeferred<boolean>();
  private eventListeners = new Map();
  private nextMessageId = 1;
  private pendingMessages: Map<number, Deferred<any>> = new Map();
  private socket: WebSocket;

  constructor({ agent }: { agent?: Agent } = {}) {
    debug("Creating WebSocket for %s with %o", replayServer, { agent });

    this.socket = new WebSocket(replayServer, {
      agent: agent,
    });

    this.socket.on("close", this.onSocketClose);
    this.socket.on("error", this.onSocketError);
    this.socket.on("open", this.onSocketOpen);
    this.socket.on("message", this.onSocketMessage);
  }

  close() {
    this.socket.close();
  }

  sendCommand<Params extends Object, ResponseType extends Object | void>({
    method,
    params,
    sessionId,
  }: {
    method: string;
    params: Params;
    sessionId?: string;
  }) {
    const id = this.nextMessageId++;

    debug("Sending command %s: %o", method, { id, params, sessionId });

    this.socket.send(
      JSON.stringify({
        id,
        method,
        params,
        sessionId,
      }),
      error => {
        if (error) {
          debug("Received socket error: %s", error);
        }
      }
    );

    const deferred = createDeferred<ResponseType>();

    this.pendingMessages.set(id, deferred);

    return deferred.promise;
  }

  waitUntilAuthenticated() {
    return this.deferredAuthenticated.promise;
  }

  private onSocketClose = () => {
    if (this.deferredAuthenticated.status === STATUS_PENDING) {
      this.deferredAuthenticated.resolve(false);
    }
  };

  private onSocketError = (error: any) => {
    debug("Socket error:\n", error);

    if (this.deferredAuthenticated.status === STATUS_PENDING) {
      this.deferredAuthenticated.resolve(false);
    }
  };

  private onSocketMessage = (contents: WebSocket.RawData) => {
    const message = JSON.parse(String(contents));
    debug("Received message %o", message);
    if (message.id) {
      const deferred = this.pendingMessages.get(message.id);
      assert(deferred, `Received message with unknown id: ${message.id}`);

      this.pendingMessages.delete(message.id);
      if (message.result) {
        deferred.resolve(message.result);
      } else if (message.error) {
        deferred.reject(new ProtocolError(message.error));
      } else {
        deferred.reject(new Error(`Channel error: ${JSON.stringify(message)}`));
      }
    } else if (this.eventListeners.has(message.method)) {
      this.eventListeners.get(message.method)(message.params);
    } else {
      console.log(`Received event without listener: ${message.method}`);
    }
  };

  private onSocketOpen = async () => {
    try {
      const accessToken = await getAccessToken();
      assert(accessToken, "No access token found");

      await setAccessToken(this, { accessToken });

      this.deferredAuthenticated.resolve(true);
    } catch (error) {
      debug("Error authenticating:\n", error);

      this.deferredAuthenticated.resolve(false);
    }
  };
}
