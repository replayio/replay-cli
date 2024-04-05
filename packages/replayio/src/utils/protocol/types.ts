import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { WebSocket } from "ws";

export type Agent = HttpAgent | HttpsAgent;

export type Callbacks = {
  onOpen: (socket: WebSocket) => void;
  onClose: (socket: WebSocket) => void;
  onError: (socket: WebSocket) => void;
};
