const WebSocket = require("ws");
const { defer } = require("./utils");

// Simple protocol client for use in writing standalone applications.

class ProtocolClient {
  constructor(address, callbacks, opts = {}) {
    this.socket = new WebSocket(address, {
      agent: opts.agent,
    });
    this.callbacks = callbacks;

    // Internal state.
    this.pendingMessages = new Map();
    this.nextMessageId = 1;

    this.socket.on("open", callbacks.onOpen);
    this.socket.on("close", callbacks.onClose);
    this.socket.on("error", callbacks.onError);
    this.socket.on("message", (message) => this.onMessage(message));

    this.eventListeners = new Map();
  }

  close() {
    this.socket.close();
  }

  async setAccessToken(accessToken) {
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

  async sendCommand(method, params, data, sessionId) {
    const id = this.nextMessageId++;
    this.socket.send(
      JSON.stringify({
        id,
        method,
        params,
        binary: data ? true : undefined,
        sessionId,
      })
    );
    if (data) {
      this.socket.send(data);
    }
    const waiter = defer();
    this.pendingMessages.set(id, waiter);
    return waiter.promise;
  }

  setEventListener(method, callback) {
    this.eventListeners.set(method, callback);
  }

  onMessage(contents) {
    const msg = JSON.parse(contents);
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

module.exports = ProtocolClient;
