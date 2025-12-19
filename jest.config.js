/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // Use screeps-jest test environment which sets up Screeps globals and constants
  testEnvironment: 'screeps-jest',

  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Root directories for test discovery
  roots: ['<rootDir>/src', '<rootDir>/test'],

  // Test file patterns
  testMatch: [
    '**/*.spec.ts',
    '**/*.test.ts'
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'test/tsconfig.json'
    }]
  },

  // Module name mapper for resolving imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],

  // Verbose output for debugging
  verbose: true,

  // Timeout for async tests (useful for integration tests)
  testTimeout: 10000
};
