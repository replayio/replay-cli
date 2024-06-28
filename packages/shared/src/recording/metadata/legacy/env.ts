import { defaulted, string } from "superstruct";

type Resolver = string | ((env: NodeJS.ProcessEnv) => string | undefined);

const firstEnvValueOf =
  (...envKeys: Resolver[]) =>
  () =>
    envKeys.reduce<string | undefined>(
      (a, k) => a || (typeof k === "function" ? k(process.env) : process.env[k]),
      undefined
    );

const envString = (...envKeys: Resolver[]) => defaulted(string(), firstEnvValueOf(...envKeys));

export { firstEnvValueOf, envString };
