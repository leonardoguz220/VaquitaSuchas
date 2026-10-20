/** @type {import('jest').Config} */
const base = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  extensionsToTreatAsEsm: ['.ts'],
  // Los imports relativos de src/ llevan sufijo .js (ESM); Jest debe resolverlos al .ts.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

export default {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    { ...base, displayName: 'e2e', testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'] },
  ],
};
