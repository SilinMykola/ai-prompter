import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server';

// Servers started by a test are closed afterwards so the test run can exit.
const started: Server[] = [];
afterEach(async () => {
  await Promise.all(started.splice(0).map((s) => new Promise((r) => s.close(r))));
});

// Port 0 asks the OS for any free port, so tests never clash with a running dev server.
async function start(staticDir?: string): Promise<Server> {
  const server = await startServer({ port: 0, staticDir });
  started.push(server);
  return server;
}

describe('placeholder server', () => {
  it('answers GET /api/health with { ok: true }', async () => {
    const server = await start();
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('network binding', () => {
  it('listens on 127.0.0.1 only', async () => {
    const server = await start();

    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });
});

describe('production static files', () => {
  it('serves the built web app from the same process', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ai-prompter-'));
    await writeFile(join(dir, 'index.html'), '<h1>built app</h1>');
    const server = await start(dir);
    const { port } = server.address() as AddressInfo;

    const page = await fetch(`http://127.0.0.1:${port}/`);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);

    expect(await page.text()).toContain('built app');
    expect(await health.json()).toEqual({ ok: true });
  });
});

describe('startup failure', () => {
  it('rejects when the port is already in use', async () => {
    const first = await start();
    const { port } = first.address() as AddressInfo;

    await expect(startServer({ port })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
});
