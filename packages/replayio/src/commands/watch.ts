import { Text, render } from "ink";
import { registerCommand } from "../utils/commander/registerCommand.js";
import { createElement } from "react";

registerCommand("watch").description("Interactive recording mode").action(watch);

async function watch() {
  render(createElement(Text, { color: "red" }, "Hello, world!"));
}
