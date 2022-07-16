jest.mock("@replayio/replay/");
const { getPlaywrightBrowserPath } = require("@replayio/replay");

import { expect, jest } from "@jest/globals";

import plugin from "./index";

describe("plugin", () => {
  it("throws if it can't find chromium or firefox", () => {
    getPlaywrightBrowserPath.mockImplementation(() => undefined);
    const on = jest.fn();
    const config: any = {
      browsers: [],
    };
    expect(() => plugin(on, config)).toThrowError("No Replay browser found");
  });
});
