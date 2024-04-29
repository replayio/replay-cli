import { logAsyncOperation, LogProgressOptions } from "./logAsyncOperation.js";

export async function logPromise<PromiseType>(
  promise: Promise<PromiseType>,
  options: LogProgressOptions & {
    messages: {
      failed?: string | ((error: Error) => string);
      pending: string;
      success?: string | ((result: PromiseType) => string);
    };
  }
) {
  const { delayBeforeLoggingMs, messages } = options;

  const progress = logAsyncOperation(messages.pending, {
    delayBeforeLoggingMs,
  });

  try {
    const result = await promise;
    const message =
      typeof messages.success === "function" ? messages.success(result) : messages.success;
    progress.setSuccess(message || "");
  } catch (error) {
    const message =
      typeof messages.failed === "function" ? messages.failed(error as Error) : messages.failed;
    progress.setFailed(message || "");
  }
}
