/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/(*.)+(spec|test).[jt]s?(x)"],
  moduleNameMapper: {
    uuid: require.resolve("uuid"),
  },
};
