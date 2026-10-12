import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config';
import { createRegistry } from './llm';
import { realFactories } from './llm/factories';
import { createDeepgramProvider } from './stt/deepgram';
import { startServer } from './server';

// Settings live in the .env file in the repository root (two levels up from this file).
// loadEnvFile throws if the file is missing; that is fine, the real environment is used then.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch (error) {
  // A missing file is fine; anything else (permissions, bad syntax) is not.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  // A bad configuration is a normal mistake, not a crash: print the reason and stop.
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
for (const warning of config.warnings) console.warn(`warning: ${warning}`);

// Serve the built web app if `npm run build` has been run (npm start).
// During `npm run dev` there is no dist folder and Vite serves the page instead.
const distDir = fileURLToPath(new URL('../../web/dist', import.meta.url));
const registry = createRegistry(config, realFactories);
// Logging goes through one function so it is easy to check what is (and is not) logged:
// only event names, never text from a call.
const log = (event: string) => console.log(`[${new Date().toISOString()}] ${event}`);
const stt = createDeepgramProvider({ apiKey: config.deepgram.apiKey, model: config.deepgram.model, log });
await startServer({
  port: config.port,
  staticDir: existsSync(distDir) ? distDir : undefined,
  registry,
  ws: { stt, registry, log },
});
console.log(`server listening on http://127.0.0.1:${config.port}`);
