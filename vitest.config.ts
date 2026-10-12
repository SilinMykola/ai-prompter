import { defineConfig } from 'vitest/config';

// One Vitest run for the whole monorepo: each workspace is a "project"
// with its own root and environment. `npm test` at the repo root runs them all.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', root: 'shared', environment: 'node', include: ['*.test.ts'] } },
      { test: { name: 'server', root: 'server', environment: 'node', include: ['src/**/*.test.ts'] } },
      {
        // The browser app: tests run in jsdom (a fake browser DOM written in JavaScript).
        esbuild: { jsx: 'automatic' }, // lets test files contain JSX without importing React
        test: {
          name: 'web',
          root: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./test/setup.ts'],
        },
      },
    ],
  },
});
