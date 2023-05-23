import { exponentialBackoffRetry } from "./utils";

describe("exponentialBackoffRetry", () => {
  it("retries up to five times", () => {
    const failingFunction = jest.fn(() => {
      throw Error("ExpectedError");
    });

    expect(async () => await exponentialBackoffRetry(failingFunction)).rejects.toThrow();

    expect(failingFunction).toHaveBeenCalledTimes(5);
  });

  it("retries until it succeeds", async () => {
    let i = 0;
    const failingFunction = jest.fn(() => {
      i++;
      if (i < 3) {
        throw Error("ExpectedError");
      }
    });

    await exponentialBackoffRetry(failingFunction);

    expect(failingFunction).toHaveBeenCalledTimes(3);
  });
});
