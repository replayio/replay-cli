import { render } from "ink";
import EventEmitter from "node:events";
import { Task } from "./Task.js";
import { createElement } from "react";

describe("Task", () => {
  it("should render", () => {
    const output = renderToString(
      createElement(Task, {
        details: "details",
        name: "name",
        status: "pending",
      })
    );
    expect(output).toMatchInlineSnapshot();
  });
});

function renderToString(node: JSX.Element, options?: { columns: number }) {
  const stdout = createFakeStdout(options?.columns);

  render(node, {
    stdout,
    debug: true,
  });

  return stdout.get();
}

type FakeStdout = {
  get: () => string;
} & NodeJS.WriteStream;

function createFakeStdout(columns: number = 100): FakeStdout {
  const stdout = new EventEmitter() as unknown as FakeStdout;
  stdout.columns = columns ?? 100;

  let lastRendered = "";

  // @ts-ignore
  stdout.write = function write(string: string) {
    lastRendered = string;
  };
  stdout.get = () => lastRendered;

  return stdout;
}
