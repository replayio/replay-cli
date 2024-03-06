import { exponentialBackoffRetry, linearBackoffRetry } from "./utils";

describe("exponentialBackoffRetry", () => {
  it("retries up to five times", async () => {
    const failingFunction = jest.fn(async () => {
      throw Error("ExpectedError");
    });

    await expect(async () => await exponentialBackoffRetry(failingFunction)).rejects.toThrow();

    expect(failingFunction).toHaveBeenCalledTimes(5);
  });

  it("retries with an async callback", async () => {
    const failingFunction = jest.fn(() => {
      throw new Error("ExpectedError");
    });

    await expect(
      async () => await exponentialBackoffRetry(async () => await failingFunction())
    ).rejects.toThrow();

    expect(failingFunction).toHaveBeenCalledTimes(5);
  });

  it("retries until it succeeds", async () => {
    let i = 0;
    const failingFunction = jest.fn(async () => {
      i++;
      if (i < 3) {
        throw Error("ExpectedError");
      }
    });

    await exponentialBackoffRetry(failingFunction);

    expect(failingFunction).toHaveBeenCalledTimes(3);
  });

  it("respects the maxTries parameter by retrying only the specified number of times", async () => {
    const mockFn = jest.fn();
    mockFn.mockRejectedValue(new Error("Expected failure"));

    const maxTries = 3;

    await expect(exponentialBackoffRetry(mockFn, undefined, maxTries)).rejects.toThrow(
      "Expected failure"
    );
    expect(mockFn).toHaveBeenCalledTimes(maxTries);
  });
});

describe("linearBackoffRetry", () => {
  it("retries the function until it succeeds", async () => {
    const mockFn = jest.fn();
    mockFn
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockRejectedValueOnce(new Error("Fail 2"))
      .mockResolvedValue("Success");

    await expect(linearBackoffRetry(mockFn)).resolves.toEqual("Success");
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts", async () => {
    const mockFn = jest.fn();
    mockFn.mockRejectedValue(new Error("Fail"));

    await expect(linearBackoffRetry(mockFn)).rejects.toThrow("Fail");
    expect(mockFn).toHaveBeenCalledTimes(5);
  });
});
