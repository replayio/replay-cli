import { SessionId, sessionError } from "@replayio/protocol";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { Deferred, STATUS_PENDING, createDeferred } from "../async/createDeferred";
import { replayWsServer } from "../config";
import { logDebug, logError } from "../logger";
import { ProtocolError } from "./ProtocolError";
import { setAccessToken } from "./api/setAccessToken";

type Callback = (params: any) => void;

type CommandData = {
  // `command` is kept around only for logDebugging purposes
  command: unknown;
  sessionId: SessionId | undefined;
};

export default class ProtocolClient {
  private deferredAuthenticated = createDeferred<boolean>();
  private eventListeners: Map<string, Set<Callback>> = new Map();
  private nextMessageId = 1;
  private pendingCommands: Map<number, Deferred<any, CommandData>> = new Map();
  private socket: WebSocket;
  private accessToken: string;

  constructor(accessToken: string) {
    logDebug(`Creating WebSocket for ${replayWsServer}`);

    this.accessToken = accessToken;
    this.socket = new WebSocket(replayWsServer);

    this.socket.on("close", this.onSocketClose);
    this.socket.on("error", this.onSocketError);
    this.socket.on("open", this.onSocketOpen);
    this.socket.on("message", this.onSocketMessage);

    this.listenForMessage("Recording.sessionError", (error: sessionError) => {
      if (error.sessionId) {
        this.pendingCommands.forEach(deferred => {
          if (deferred.status === STATUS_PENDING && deferred.data?.sessionId === error.sessionId) {
            deferred.reject(
              new ProtocolError({
                code: error.code,
                message: error.message,
                data: {
                  sessionId: error.sessionId,
                },
              })
            );
          }
        });
      }
    });
  }

  close() {
    this.socket.close();
  }

  listenForMessage(method: string, callback: Callback) {
    let listeners = this.eventListeners.get(method);
    if (listeners == null) {
      listeners = new Set([callback]);

      this.eventListeners.set(method, listeners);
    } else {
      listeners.add(callback);
    }

    return () => {
      listeners!.delete(callback);
    };
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

    logDebug("Sending command", { id, method, params, sessionId });

    const command = {
      id,
      method,
      params,
      sessionId,
    };

    this.socket.send(JSON.stringify(command), error => {
      if (error) {
        logDebug("Received socket error", { error });
      }
    });

    const deferred = createDeferred<ResponseType, CommandData>({ sessionId, command });

    this.pendingCommands.set(id, deferred);

    return deferred.promise;
  }

  waitUntilAuthenticated() {
    return this.deferredAuthenticated.promise;
  }

  private onSocketClose = () => {
    if (this.deferredAuthenticated.status === STATUS_PENDING) {
      this.deferredAuthenticated.reject(new Error("Socket closed before authentication completed"));
    }
  };

  private onSocketError = (error: any) => {
    logError("ProtocolClient:Error", { error });

    if (this.deferredAuthenticated.status === STATUS_PENDING) {
      this.deferredAuthenticated.reject(error);
    }
  };

  private onSocketMessage = (contents: WebSocket.RawData) => {
    const { error, id, method, params, result } = JSON.parse(String(contents));

    if (id) {
      const deferred = this.pendingCommands.get(id);
      assert(deferred, `Received message with unknown id: ${id}`);

      this.pendingCommands.delete(id);
      if (result) {
        logDebug("Resolving response", { contents });
        deferred.resolve(result);
      } else if (error) {
        logDebug("Received error", { contents });
        deferred.reject(new ProtocolError(error));
      } else {
        logDebug("Received error", { contents });
        deferred.reject(new Error(`Channel error: ${contents}`));
      }
    } else if (this.eventListeners.has(method)) {
      logDebug("Received event", { contents });
      const callbacks = this.eventListeners.get(method);
      if (callbacks) {
        callbacks.forEach(callback => callback(params));
      }
    } else {
      logDebug("Received message without a handler", { contents });
    }
  };

  private onSocketOpen = async () => {
    try {
      await setAccessToken(this, { accessToken: this.accessToken });
      this.deferredAuthenticated.resolve(true);
    } catch (error) {
      logError("ProtocolClient:ServerAuthFailed", { error });
      this.socket.close();
      this.deferredAuthenticated.reject(error as Error);
    }
  };
}
