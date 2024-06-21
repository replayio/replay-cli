/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  testTimeout: 20000,
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/(*.)+(spec|test).[jt]s?(x)", "!**/fixtures-app/**"],
  // TODO: implement dependencyExtractor: the whole src directory and the whole fixture app should be added here
};
