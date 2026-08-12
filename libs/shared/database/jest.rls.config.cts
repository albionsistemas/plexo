/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

// Separate from jest.config.cts/the `test` target on purpose: these are
// real-Postgres RLS security tests (connect as plexo_app, do real
// transactions), not the fast mocked unit tests `nx test database` runs -
// mixing them would make every `nx affected -t test` require a live
// database. Run explicitly via `nx run database:test-rls`. See
// src/lib/rls-security/rls-test-client.ts for the connection/session setup
// and project.json for how this file is wired to its own target (same
// explicit-target pattern apps/api-e2e/project.json already uses for its
// own non-default jest config).
module.exports = {
  displayName: 'database-rls',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testMatch: ['<rootDir>/src/**/*.rls-spec.ts'],
  // Each file seeds a full tenant graph (dozens of inserts) over a real
  // network connection - the 5s Jest default is too tight under load.
  testTimeout: 30000,
  coverageDirectory: 'test-output/jest-rls/coverage',
};
