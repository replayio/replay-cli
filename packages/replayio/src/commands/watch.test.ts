import { Text } from "ink";
import { createElement } from "react";
import { renderToString } from "../utils/ink.js";

describe("renderToString", () => {
  it("Test", () => {
    expect(
      renderToString(createElement(Text, { color: "red" }, "Hello, world!"))
    ).toMatchInlineSnapshot();
  });
});
