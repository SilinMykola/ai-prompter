import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read the shared .env from the repository root. The empty prefix ('') loads every
  // variable, but only inside this config file; nothing is exposed to browser code.
  const rootDir = fileURLToPath(new URL('..', import.meta.url));
  const env = loadEnv(mode, rootDir, '');

  const serverTarget = `http://127.0.0.1:${env.PORT || 8787}`;

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      // 5173 and 5180 are used by other local apps, so the default here is 5175.
      port: Number(env.WEB_PORT) || 5175,
      // Fail loudly if the port is taken instead of silently picking another one.
      strictPort: true,
      // In dev the browser talks to Vite only; Vite forwards these paths to the Node server.
      // This is also how it works in production (one origin), so no CORS setup is needed.
      proxy: {
        // Anchored patterns (^...) so only /api/... and /ws match, not /apifoo or /wsdemo.
        '^/api/': serverTarget,
        '^/ws$': { target: serverTarget, ws: true },
      },
    },
  };
});
