import nextJest from 'next/jest.js';

// next/jest carga next.config, transforma con SWC y simula CSS e imágenes.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/e2e/'],
  maxWorkers: '50%',
  testTimeout: 15000,
};

export default createJestConfig(config);
