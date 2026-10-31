/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  // Integration suites need PostgreSQL/Redis and run via jest.integration.config.js
  // (`pnpm test:integration`); they must never be silently part of the unit run.
  testPathIgnorePatterns: ["/node_modules/", "\\.integration\\.test\\.ts$"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
