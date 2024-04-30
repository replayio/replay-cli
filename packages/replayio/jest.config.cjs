const esModules = ["ink"].join("|");

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest/presets/js-with-ts",
  testEnvironment: "node",
  testMatch: ["**/(*.)+(spec|test).[jt]s?(x)"],
  moduleNameMapper: {
    ink: require.resolve("ink"),
    uuid: require.resolve("uuid"),
  },
  transformIgnorePatterns: [`/node_modules/(?!${esModules})`],
  transform: {
    "^.+.[tj]sx?$": ["babel-jest"],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  // transform: {},
};
