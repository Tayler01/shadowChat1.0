export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.test.json'
      }
    ]
  },
  moduleNameMapper: {
    '^.*apps/streamlined/src-overrides/lib/env$': '<rootDir>/tests/mocks/env.ts',
    '\\.(png|jpe?g|webp|avif|gif|svg)$': '<rootDir>/tests/mocks/fileAsset.ts',
    '^@supabase/supabase-js$': '<rootDir>/tests/mocks/supabase-js.ts',
    '^\\./env$': '<rootDir>/tests/mocks/env.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  testPathIgnorePatterns: ['\\.node\\.test\\.mjs$'],
  // Unity caches and local media evidence are not JavaScript test roots.
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts']
};
