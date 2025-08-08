/** @type {import('jest').Config} */
const config = {
  verbose: true,
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
    "^.+\\.(js|jsx)$": "babel-jest",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // This is the key change: it tells Jest to NOT ignore these specific modules
  // during transformation, because they use modern ES Module syntax.
  transformIgnorePatterns: [
    "/node_modules/(?!(@genkit-ai|yaml)/)",
  ],
};

export default config;
