/* eslint-disable */
const { readFileSync } = require('fs');

// Reading the SWC compilation config for the spec files
const swcJestConfig = JSON.parse(
  readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'),
);

// Disable .swcrc look-up by SWC core because we're passing in swcJestConfig ourselves
swcJestConfig.swcrc = false;

module.exports = {
  displayName: 'taxes',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': ['@swc/jest', swcJestConfig],
  },
  // @react-pdf/renderer ships ESM-only - ver el mismo comentario en
  // libs/modules/purchases/jest.config.cts (mismo motivo, misma lib).
  transformIgnorePatterns: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'html'],
  coverageDirectory: 'test-output/jest/coverage',
};
