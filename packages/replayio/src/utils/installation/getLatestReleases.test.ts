import fetch from "node-fetch";
import { mocked } from "jest-mock";
import { getLatestRelease } from "./getLatestReleases";
import { replayAppHost } from "../../config";
import { Release } from "./types";

jest.mock("node-fetch");
const mockedFetch = mocked(fetch, true);

jest.mock("./config", () => ({
  runtimeMetadata: {
    architecture: "x86_64",
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

  it("should return the latest release and handle null architectures", async () => {
    const expectedUrl = `${replayAppHost}/api/releases`;
    const release: Release = {
      architecture: null,
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      platform: "linux",
      releaseFile: "mocked-release-file",
      runtime: "chromium",
      time: Date.now().toString(),
      version: "mocked-version",
    };
    const oldRelease: Release = {
      architecture: null,
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      platform: "linux",
      releaseFile: "mocked-release-file",
      runtime: "chromium",
      time: (Date.now() - 1000).toString(),
      version: "mocked-version",
    };
    mockedFetch.mockResolvedValueOnce({ json: async () => [release, oldRelease] } as any);

    await expect(getLatestRelease()).resolves.toEqual(release);

    expect(mockedFetch).toHaveBeenCalledWith(expectedUrl);
  });

  it("should return the latest release for the current platform + architecture", async () => {
    const expectedUrl = `${replayAppHost}/api/releases`;
    const now = Date.now().toString();
    const x86Release: Release = {
      architecture: "x86_64",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      platform: "linux",
      releaseFile: "mocked-release-file",
      runtime: "chromium",
      time: now,
      version: "mocked-version",
    };
    const armRelease: Release = {
      architecture: "arm",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      platform: "linux",
      releaseFile: "mocked-release-file",
      runtime: "chromium",
      time: now,
      version: "mocked-version",
    };
    const oldRelease: Release = {
      architecture: "x86_64",
      buildFile: "mocked-build-file",
      buildId: "mocked-build-id",
      platform: "linux",
      releaseFile: "mocked-release-file",
      runtime: "chromium",
      time: (Date.now() - 1000).toString(),
      version: "mocked-version",
    };
    mockedFetch.mockResolvedValueOnce({
      json: async () => [armRelease, x86Release, oldRelease],
    } as any);

    await expect(getLatestRelease()).resolves.toEqual(x86Release);

    expect(mockedFetch).toHaveBeenCalledWith(expectedUrl);
  });
});
