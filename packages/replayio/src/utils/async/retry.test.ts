import { retryWithExponentialBackoff, retryWithLinearBackoff } from "./retry";

describe("retryWithExponentialBackoff", () => {
  it("retries until it succeeds", async () => {
    let i = 0;
    const failingFunction = jest.fn(async () => {
      i++;
      if (i < 3) {
        throw Error("ExpectedError");
      }
    });

    await retryWithExponentialBackoff(failingFunction);

    expect(failingFunction).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts", async () => {
    const mockFn = jest.fn();
    mockFn.mockRejectedValue(new Error("Expected failure"));

    const maxTries = 3;

    await expect(retryWithExponentialBackoff(mockFn, undefined, maxTries)).rejects.toThrow(
      "Expected failure"
    );
    expect(mockFn).toHaveBeenCalledTimes(maxTries);
  });
});

describe("retryWithLinearBackoff", () => {
  it("retries until it succeeds", async () => {
    const mockFn = jest.fn();
    mockFn
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockRejectedValueOnce(new Error("Fail 2"))
      .mockResolvedValue("Success");

    await expect(retryWithLinearBackoff(mockFn)).resolves.toEqual("Success");
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("throws after max attempts", async () => {
    const mockFn = jest.fn();
    mockFn.mockRejectedValue(new Error("Fail"));

    await expect(retryWithLinearBackoff(mockFn)).rejects.toThrow("Fail");
    expect(mockFn).toHaveBeenCalledTimes(5);
  });
});
