import assert from "assert";
import { cachedFetch, resetCache } from "./cachedFetch";

class Response {
  public status: number;
  public statusText: string;

  constructor(status: number, statusText: string) {
    this.status = status;
    this.statusText = statusText;
  }

  async json() {
    return {
      text: this.statusText,
    };
  }
}

const failedResponse = new Response(500, "error");
const successResponse = new Response(200, "ok");

describe("cachedFetch", () => {
  let globalFetch: typeof fetch;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    globalFetch = global.fetch;
    mockFetch = global.fetch = jest.fn(async (url: string) => {
      return successResponse;
    }) as jest.Mock;
  });

  afterEach(() => {
    global.fetch = globalFetch;

    resetCache();
  });

  it("should return a successful response", async () => {
    const response = await cachedFetch("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith("https://www.test.com", undefined);
    expect(response).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "text": "ok",
        },
        "status": 200,
        "statusText": "ok",
      }
    `);
  });

  it("should retry after a failed request", async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve(failedResponse));

    const response = await cachedFetch("https://www.test.com", undefined, {
      baseDelay: 10,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith("https://www.test.com", undefined);
    expect(response).toMatchInlineSnapshot(`
      Object {
        "json": Object {
          "text": "ok",
        },
        "status": 200,
        "statusText": "ok",
      }
    `);
  });

  it("should return a failed response after retries have been exhausted", async () => {
    mockFetch.mockReturnValue(Promise.resolve(failedResponse));

    const response = await cachedFetch("https://www.test.com", undefined, {
      baseDelay: 10,
      maxAttempts: 2,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith("https://www.test.com", undefined);
    expect(response).toMatchInlineSnapshot(`
      Object {
        "json": null,
        "status": 500,
        "statusText": "error",
      }
    `);
  });

  it("should cache a successful response", async () => {
    const response = await cachedFetch("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const cachedResponse = await cachedFetch("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(response).toBe(cachedResponse);
  });

  it("should cache a failed response", async () => {
    mockFetch.mockReturnValue(Promise.resolve(failedResponse));

    const response = await cachedFetch("https://www.test.com", undefined, {
      baseDelay: 10,
      maxAttempts: 2,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const cachedResponse = await cachedFetch("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response).toBe(cachedResponse);
  });

  it("should allow a single cached value to be evicted", async () => {
    mockFetch.mockReturnValue(new Response(200, "A"));
    const responseA = await cachedFetch("https://www.test.com/A");

    mockFetch.mockReturnValue(new Response(200, "B"));
    const responseB = await cachedFetch("https://www.test.com/B");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(responseA).not.toBe(responseB);

    resetCache("https://www.test.com/A");

    const uncachedResponseA = await cachedFetch("https://www.test.com/A");
    const cachedResponseB = await cachedFetch("https://www.test.com/B");

    expect(mockFetch).toHaveBeenCalledTimes(3);

    expect(responseA).not.toBe(uncachedResponseA);
    expect(responseB).toBe(cachedResponseB);
  });

  it("should allow the caller to decide if a retry should be attempted", async () => {
    mockFetch.mockReturnValue(Promise.resolve(failedResponse));

    let retryCount = 0;

    const response = await cachedFetch("https://www.test.com", undefined, {
      maxAttempts: 3,
      shouldRetry: async response => {
        assert(response.status === 500);
        retryCount++;
        return retryCount === 1;
      },
    });

    assert(retryCount === 2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response).toMatchInlineSnapshot(`
      Object {
        "json": null,
        "status": 500,
        "statusText": "error",
      }
    `);
  });

  it("should still honor the maxAttempts setting even when shouldRetry is provided", async () => {
    mockFetch.mockReturnValue(Promise.resolve(failedResponse));

    const response = await cachedFetch("https://www.test.com", undefined, {
      maxAttempts: 2,
      shouldRetry: () => Promise.resolve(true),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response).toMatchInlineSnapshot(`
      Object {
        "json": null,
        "status": 500,
        "statusText": "error",
      }
    `);
  });
});
