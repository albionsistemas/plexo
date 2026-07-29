/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'purchases',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['@swc/jest', swcJestConfig],
  },
  // @react-pdf/renderer (and its own dependency tree) ships ESM-only
  // (`import`/`export` in .js, no CJS build) - Jest's default
  // transformIgnorePatterns skips all of node_modules, which leaves those
  // import statements untranspiled and the test suite fails to even parse.
  // Transforming everything (nothing ignored) is the simplest fix for a
  // lib this small; a narrower allowlist would need updating every time a
  // transitive dep changes.
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
