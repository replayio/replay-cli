type ErrorDataValue = string | number | boolean | null;
type ErrorData = Record<string, ErrorDataValue>;
type ProtocolErrorBase = {
  code: number;
  message: string;
  data: ErrorData;
};

export class ProtocolError extends Error {
  readonly protocolCode: number;
  readonly protocolMessage: string;
  readonly protocolData: unknown;

  constructor(error: ProtocolErrorBase) {
    super(`protocol error ${error.code}: ${error.message}`);

    this.protocolCode = error.code;
    this.protocolMessage = error.message;
    this.protocolData = error.data ?? {};
  }

  toString() {
    return `Protocol error ${this.protocolCode}: ${this.protocolMessage}`;
  }
}
