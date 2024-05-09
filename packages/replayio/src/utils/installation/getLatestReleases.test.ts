import fetch from "node-fetch";
import { mocked } from "jest-mock";
import { getLatestRelease } from "./getLatestReleases";
import { replayAppHost } from "../../config";
import { Release } from "./types";

jest.mock("node-fetch");
const mockedFetch = mocked(fetch, true);

jest.mock("./config", () => ({
  runtimeMetadata: {
    platform: "linux",
    runtime: "chromium",
  },
}));

describe("getLatestRelease", () => {
  beforeEach(() => {
    mockedFetch.mockClear();
  });

  it("should throw an error if a recent release cannot be found", async () => {
    const expectedUrl = `${replayAppHost}/api/releases`;
    mockedFetch.mockResolvedValueOnce({ json: async () => [] } as any);

    await expect(getLatestRelease()).rejects.toThrowError("No release found for linux:chromium");

    expect(mockedFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it("should return the latest release", async () => {
    const expectedUrl = `${replayAppHost}/api/releases`;
    const release: Release = {
      platform: "linux",
      runtime: "chromium",
      releaseFile: "mocked-release-file",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      version: "mocked-version",
      time: Date.now().toString(),
    };
    const oldRelease: Release = {
      platform: "linux",
      runtime: "chromium",
      releaseFile: "mocked-release-file",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      version: "mocked-version",
      time: (Date.now() - 1000).toString(),
    };
    mockedFetch.mockResolvedValueOnce({ json: async () => [release, oldRelease] } as any);

    await expect(getLatestRelease()).resolves.toEqual(release);

    expect(mockedFetch).toHaveBeenCalledWith(expectedUrl);
  });
});
