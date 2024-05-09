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
    architecture: "x86_64",
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

  it("should return the latest release and handle null architectures", async () => {
    const expectedUrl = `${replayAppHost}/api/releases`;
    const release: Release = {
      platform: "linux",
      architecture: null,
      runtime: "chromium",
      releaseFile: "mocked-release-file",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      version: "mocked-version",
      time: Date.now().toString(),
    };
    const oldRelease: Release = {
      platform: "linux",
      architecture: null,
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

  it("should return the latest release for the current platform + architecture", async () => {
    const expectedUrl = `${replayAppHost}/api/releases`;
    const now = Date.now().toString();
    const x86Release: Release = {
      platform: "linux",
      architecture: "x86_64",
      runtime: "chromium",
      releaseFile: "mocked-release-file",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      version: "mocked-version",
      time: now,
    };
    const armRelease: Release = {
      platform: "linux",
      architecture: "arm",
      runtime: "chromium",
      releaseFile: "mocked-release-file",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      version: "mocked-version",
      time: now,
    };
    const oldRelease: Release = {
      platform: "linux",
      architecture: "x86_64",
      runtime: "chromium",
      releaseFile: "mocked-release-file",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      version: "mocked-version",
      time: (Date.now() - 1000).toString(),
    };
    mockedFetch.mockResolvedValueOnce({
      json: async () => [armRelease, x86Release, oldRelease],
    } as any);

    await expect(getLatestRelease()).resolves.toEqual(x86Release);

    expect(mockedFetch).toHaveBeenCalledWith(expectedUrl);
  });
});
