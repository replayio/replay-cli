import { WebSocket } from "ws";

export type Callbacks = {
  onOpen: (socket: WebSocket) => void;
  onClose: (socket: WebSocket) => void;
  onError: (socket: WebSocket) => void;
};
