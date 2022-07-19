import { firstEnvValueOf } from "./env";

describe("firstEnvValueOf", () => {
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = env;
  });

  describe("using key names", () => {
    it("returns first value", () => {
      process.env = {
        KEY_1: "key 1",
        KEY_2: "key 2",
      };

      const resolver = firstEnvValueOf("KEY_1", "KEY_2");
      const result = resolver();

      expect(result).toMatchSnapshot();
    });

    it("ignores empty strings", () => {
      process.env = {
        KEY_1: "",
        KEY_2: "key 2",
      };

      const resolver = firstEnvValueOf("KEY_1", "KEY_2");
      const result = resolver();

      expect(result).toMatchSnapshot();
    });

    it("ignores undefined keys", () => {
      process.env = {
        KEY_1: undefined,
        KEY_2: "key 2",
      };

      const resolver = firstEnvValueOf("KEY_1", "KEY_2");
      const result = resolver();

      expect(result).toMatchSnapshot();
    });

    it("returns undefined when no keys match", () => {
      process.env = {
        KEY_1: undefined,
        KEY_2: "key 2",
      };

      const resolver = firstEnvValueOf("KEY_3");
      const result = resolver();

      expect(result).toMatchSnapshot();
    });
  });

  describe("using callbacks", () => {
    it("returns first value", () => {
      process.env = {
        KEY_1: "key 1",
        KEY_1_VALUE: "value 1",
        KEY_2: "key 2",
        KEY_2_VALUE: "value 2",
      };

      const resolver = firstEnvValueOf(
        env => env.KEY_1 && env.KEY_1_VALUE,
        env => env.KEY_2 && env.KEY_2_VALUE
      );
      const result = resolver();

      expect(result).toMatchSnapshot();
    });

    it("ignores empty strings", () => {
      process.env = {
        KEY_1: "key 1",
        KEY_1_VALUE: "",
        KEY_2: "key 2",
        KEY_2_VALUE: "value 2",
      };

      const resolver = firstEnvValueOf(
        env => env.KEY_1 && env.KEY_1_VALUE,
        env => env.KEY_2 && env.KEY_2_VALUE
      );
      const result = resolver();

      expect(result).toMatchSnapshot();
    });

    it("ignores undefined keys", () => {
      process.env = {
        KEY_1: "key 1",
        KEY_1_VALUE: undefined,
        KEY_2: "key 2",
        KEY_2_VALUE: "value 2",
      };

      const resolver = firstEnvValueOf(
        env => env.KEY_1 && env.KEY_1_VALUE,
        env => env.KEY_2 && env.KEY_2_VALUE
      );
      const result = resolver();

      expect(result).toMatchSnapshot();
    });

    it("returns undefined when no keys match", () => {
      process.env = {
        KEY_1: "key 1",
        KEY_2: "key 2",
      };

      const resolver = firstEnvValueOf(
        env => env.KEY_1 && env.KEY_1_VALUE,
        env => env.KEY_2 && env.KEY_2_VALUE
      );
      const result = resolver();

      expect(result).toMatchSnapshot();
    });
  });
});
