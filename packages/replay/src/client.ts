import dbg from "debug";
import WebSocket from "ws";
import { Options } from "./types";
import { defer } from "./utils";

const debug = dbg("replay:protocol");

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

  constructor(address: string, callbacks: Callbacks, opts: Options = {}) {
    debug("Creating WebSocket for %s with %o", address, { agent: opts.agent });
    this.socket = new WebSocket(address, {
      agent: opts.agent,
    });
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

  async sendCommand<T = unknown, P extends object = Record<string, unknown>>(
    method: string,
    params: P,
    data?: any,
    sessionId?: string,
    callback?: (err?: Error) => void
  ) {
    const id = this.nextMessageId++;
    debug("Sending command %s: %o", method, { id, params, sessionId });
    this.socket.send(
      JSON.stringify({
        id,
        method,
        params,
        binary: data ? true : undefined,
        sessionId,
      }),
      err => {
        if (!err && data) {
          this.socket.send(data, callback);
        } else {
          callback?.(err);
        }
      }
    );
    const waiter = defer<T>();
    this.pendingMessages.set(id, waiter);
    return waiter.promise;
  }

  setEventListener(method: string, callback: (params: any) => void) {
    this.eventListeners.set(method, callback);
  }

  onMessage(contents: WebSocket.RawData) {
    const msg = JSON.parse(String(contents));
    debug("Received message %o", msg);
    if (msg.id) {
      const { resolve, reject } = this.pendingMessages.get(msg.id);
      this.pendingMessages.delete(msg.id);
      if (msg.result) {
        resolve(msg.result);
      } else {
        reject(`Channel error: ${JSON.stringify(msg)}`);
      }
    } else if (this.eventListeners.has(msg.method)) {
      this.eventListeners.get(msg.method)(msg.params);
    } else {
      console.log(`Received event without listener: ${msg.method}`);
    }
  }
}

export default ProtocolClient;
