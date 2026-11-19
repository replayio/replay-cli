import { mkdtempSync, writeFileSync } from "fs";
import { open } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { fdInfoHasWriteAccess, isOpenForWriting, lsofOutputHasWriter } from "./recordingWriter";

describe("recordingWriter", () => {
  (process.platform === "linux" ? it : it.skip)(
    "detects a writer, but not a reader, of the file",
    async () => {
      const path = join(mkdtempSync(join(tmpdir(), "recording-writer-")), "recording.dat");
      writeFileSync(path, "");

      expect(await isOpenForWriting(path)).toBe(false);

      const reader = await open(path, "r");
      expect(await isOpenForWriting(path)).toBe(false);

      const writer = await open(path, "a");
      expect(await isOpenForWriting(path)).toBe(true);

      await writer.close();
      expect(await isOpenForWriting(path)).toBe(false);
      await reader.close();
    }
  );

  it("reads the access mode from /proc fdinfo", () => {
    expect(fdInfoHasWriteAccess("pos:\t0\nflags:\t0100000\nmnt_id:\t1\n")).toBe(false);
    expect(fdInfoHasWriteAccess("pos:\t0\nflags:\t0100001\nmnt_id:\t1\n")).toBe(true);
    expect(fdInfoHasWriteAccess("pos:\t0\nflags:\t02102002\nmnt_id:\t1\n")).toBe(true);
  });

  it("reads the access mode from lsof output", () => {
    expect(lsofOutputHasWriter("p123\nf3\nar\n")).toBe(false);
    expect(lsofOutputHasWriter("p123\nf3\nar\np456\nf9\naw\n")).toBe(true);
    expect(lsofOutputHasWriter("p123\nf3\nau\n")).toBe(true);
    expect(lsofOutputHasWriter("")).toBe(false);
  });
});
