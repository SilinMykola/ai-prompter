import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { startServer } from './server';

// Settings live in the .env file in the repository root (two levels up from this file).
// loadEnvFile throws if the file is missing; that is fine, defaults are used then.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  // A missing file is fine (defaults are used); anything else (permissions, bad syntax) is not.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = Number(process.env.PORT) || 8787;

// Serve the built web app if `npm run build` has been run (npm start).
// During `npm run dev` there is no dist folder and Vite serves the page instead.
const distDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
await startServer({ port, staticDir: existsSync(distDir) ? distDir : undefined });
console.log(`server listening on http://127.0.0.1:${port}`);
