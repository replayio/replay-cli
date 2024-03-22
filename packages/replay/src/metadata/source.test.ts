import { init } from "./source";

describe("source", () => {
  describe("init", () => {
    describe("buildkite", () => {
      it("omits merge.id when BUILDKITE_PULL_REQUEST is false", async () => {
        process.env.BUILDKITE_COMMIT = "abc";
        process.env.BUILDKITE_PULL_REQUEST = "false";

        const source = await init();
        expect(source).toHaveProperty("source.merge.id", undefined);
      });

      it("includes merge.id when BUILDKITE_PULL_REQUEST is valued", async () => {
        process.env.BUILDKITE_COMMIT = "abc";
        process.env.BUILDKITE_PULL_REQUEST = "123";

        const source = await init();
        expect(source).toHaveProperty("source.merge.id", "123");
      });
    });
  });
});
