import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Vitest 4+ no longer excludes build output by default; skip the compiled
    // copies of the tests that `npm run build` writes to dist/.
    exclude: [...configDefaults.exclude, 'dist/**'],
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__tests__/**'],
      reportsDirectory: './coverage',
    },
  },
});
