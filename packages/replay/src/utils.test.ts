import { exponentialBackoffRetry } from "./utils";

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
});
