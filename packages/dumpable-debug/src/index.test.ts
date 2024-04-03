import fsP from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import _debug, { ClosableDebug } from "./index";

const uniqueId = () => Math.random().toString(36).slice(2);

const tempDir = fs.realpathSync(os.tmpdir());

const created: ClosableDebug[] = [];

const debug: typeof _debug = (...args) => {
  const d = _debug(...args);
  created.push(d);
  const closeLogFile = d.closeLogFile;
  d.closeLogFile = () => {
    created.splice(created.indexOf(d), 1);
    return closeLogFile();
  };
  return d;
};

afterEach(() => {
  created.forEach(d => d.closeLogFile());
});

describe("dumpable debug", () => {
  it("should write logs to a file", async () => {
    const d = debug("test");
    d("foo");
    d("bar");
    const logFile = await d.closeLogFile();
    const log = await fsP.readFile(logFile, "utf8");
    expect(log).toBe(["[test] foo", "[test] bar"].join("\n") + "\n");
  });

  it("should be able to extend the original namespace", async () => {
    const d1 = debug("test");
    d1("foo");
    d1("bar");
    const d2 = d1.extend("inner");
    d2("x");
    d2("yz");
    const d3 = d2.extend("circle");
    d3("of");
    d3("hell");
    const logFile = await d1.closeLogFile();
    const log = await fsP.readFile(logFile, "utf8");
    expect(log).toBe(
      [
        "[test] foo",
        "[test] bar",
        "[test:inner] x",
        "[test:inner] yz",
        "[test:inner:circle] of",
        "[test:inner:circle] hell",
      ].join("\n") + "\n"
    );
  });

  it("should write logs to a temp file by default", async () => {
    const d = debug("test");
    d("foo");
    const logFile = await d.closeLogFile();
    expect(logFile.startsWith(tempDir)).toBe(true);
  });

  it("should be able to write logs into a specifier directory", async () => {
    const outputDir = path.join(tempDir, `inner-${uniqueId()}`);
    await fsP.mkdir(outputDir);
    const d = debug("test", { outputDir });
    d("foo");
    const logFile = await d.closeLogFile();
    expect(logFile.startsWith(outputDir)).toBe(true);
    const log = await fsP.readFile(logFile, "utf8");
    expect(log).toBe("[test] foo\n");
  });

  it("should create output directory recursively", async () => {
    const outputDir = path.join(
      tempDir,
      `inner-${uniqueId()}`,
      `deep-${uniqueId()}`,
      `dir-${uniqueId()}`
    );
    const d = debug("test", { outputDir });
    d("foo");
    const logFile = await d.closeLogFile();
    expect(logFile.startsWith(outputDir)).toBe(true);
    const log = await fsP.readFile(logFile, "utf8");
    expect(log).toBe("[test] foo\n");
  });

  it("should be able to create more than a single log file in the a deeply-created directory", async () => {
    const outputDir = path.join(
      tempDir,
      `inner-${uniqueId()}`,
      `deep-${uniqueId()}`,
      `dir-${uniqueId()}`
    );
    const d1 = debug("test", { outputDir });
    d1("foo");
    const d2 = debug("dev", { outputDir });
    d2("bar");
    const [logFile1, logFile2] = await Promise.all([d1.closeLogFile(), d2.closeLogFile()]);
    expect(logFile1.startsWith(outputDir)).toBe(true);
    expect(logFile2.startsWith(outputDir)).toBe(true);
    const [log1, log2] = await Promise.all([
      fsP.readFile(logFile1, "utf8"),
      fsP.readFile(logFile2, "utf8"),
    ]);
    expect(log1).toBe("[test] foo\n");
    expect(log2).toBe("[dev] bar\n");
  });

  it("should replace unsafe characters in the generated filename", async () => {
    const d = debug("t/e\\s:t");
    d("foo");
    const logFile = await d.closeLogFile();
    expect(path.basename(logFile).startsWith("t-e-s-t")).toBe(true);
  });

  it("should use the provided formatter", async () => {
    const d = debug("test");
    d("foo: %o", { bar: "baz" });
    const logFile = await d.closeLogFile();
    const log = await fsP.readFile(logFile, "utf8");
    expect(log).toBe("[test] foo: { bar: 'baz' }" + "\n");
  });
});
