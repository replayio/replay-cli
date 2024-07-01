import { transform } from "esbuild";
import { Plugin } from "rollup";

export function esbuild(): Plugin {
  return {
    name: "esbuild",
    async transform(code, id) {
      if (!/\.(mts|cts|ts|tsx)$/.test(id)) {
        return null;
      }
      const result = await transform(code, {
        loader: "ts",
      });
      return result.code;
    },
  };
}
