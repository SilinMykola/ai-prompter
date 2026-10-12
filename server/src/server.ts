import express from 'express';
import type { Server } from 'node:http';

// The app must never be reachable from other machines (see spec: "Local-only binding").
// 127.0.0.1 is the loopback address: only programs on this computer can connect.
export const HOST = '127.0.0.1';

// Building the Express app is separate from listening on a port.
// That split makes the app easy to test: a test can start it on any free port.
// `staticDir` is the folder with the built web app. In development it is not passed,
// because Vite serves the page itself.
export function createApp({ staticDir }: { staticDir?: string } = {}) {
  const app = express();

  // Placeholder route that proves the server and the Vite proxy are wired up.
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Production: this same process also serves the built React app (one process, one port).
  if (staticDir) {
    app.use(express.static(staticDir));
  }

  return app;
}

// Starts listening and resolves once the socket is open.
export function startServer({ port, staticDir }: { port: number; staticDir?: string }): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createApp({ staticDir }).listen(port, HOST, () => resolve(server));
    server.once('error', reject);
  });
}
