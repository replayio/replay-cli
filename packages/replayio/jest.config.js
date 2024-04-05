/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/(*.)+(spec|test).[jt]s?(x)"],
  moduleNameMapper: {
    uuid: require.resolve("uuid"),
  },
};
