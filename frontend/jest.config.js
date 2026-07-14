'use strict';

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: ['node_modules/(?!(@stellar|@creit\\.tech)/)'],
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
  collectCoverageFrom: ['src/lib/**/*.ts', 'src/hooks/**/*.ts'],
  coverageDirectory: 'coverage',
};
