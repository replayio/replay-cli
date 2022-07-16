jest.mock("@replayio/replay/");
import { getPlaywrightBrowserPath } from "@replayio/replay";

// we need to import these manually because jest doesn't play nicely with cypress
import { expect, jest } from "@jest/globals";

import plugin from "./index";

describe("plugin", () => {
  it("throws if it can't find chromium or firefox", () => {
    const fn: any = getPlaywrightBrowserPath;
    fn.mockImplementation(() => undefined);
    const on = jest.fn();
    const config: any = {
      browsers: [],
    };
    expect(() => plugin(on, config)).toThrowError("No Replay browser found");
  });
});
