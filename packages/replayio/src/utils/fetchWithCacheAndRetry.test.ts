import { cache, fetchWithCacheAndRetry } from "./fetchWithCacheAndRetry";

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

describe("fetchWithCacheAndRetry", () => {
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

    cache.clear();
  });

  it("should return a successful response", async () => {
    const response = await fetchWithCacheAndRetry("https://www.test.com");

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

    const response = await fetchWithCacheAndRetry("https://www.test.com", undefined, {
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

    const response = await fetchWithCacheAndRetry("https://www.test.com", undefined, {
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
    const response = await fetchWithCacheAndRetry("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const cachedResponse = await fetchWithCacheAndRetry("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(response).toBe(cachedResponse);
  });

  it("should cache a failed response", async () => {
    mockFetch.mockReturnValue(Promise.resolve(failedResponse));

    const response = await fetchWithCacheAndRetry("https://www.test.com", undefined, {
      baseDelay: 10,
      maxAttempts: 2,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const cachedResponse = await fetchWithCacheAndRetry("https://www.test.com");

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(response).toBe(cachedResponse);
  });
});
