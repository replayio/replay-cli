/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: "ts-jest",
  rootDir: "src",
  testEnvironment: "node",
  testMatch: ["**/(*.)+test.ts?(x)"],
};
