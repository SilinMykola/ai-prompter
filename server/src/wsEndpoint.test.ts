import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import WebSocket from 'ws';
import type { ServerMessage } from '@ai-prompter/shared/protocol';
import { startServer } from './server';
import { fakeRegistry, fakeStt, validStart } from './sessionTestKit';
import { isAllowedRequest } from './wsEndpoint';

const servers: Server[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.terminate());
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => (s.closeAllConnections(), s.close(r)))));
});

async function startWithStt() {
  const stt = fakeStt();
  const server = await startServer({ port: 0, ws: { stt: stt.provider, registry: fakeRegistry, log: () => {} } });
  servers.push(server);
  return { stt, port: (server.address() as AddressInfo).port };
}

interface ConnectOptions {
  path?: string;
  origin?: string;
  host?: string;
}

/** Tries to open a WebSocket; says whether it worked and, if not, the HTTP status. */
function tryConnect(port: number, { path = '/ws', origin, host }: ConnectOptions = {}) {
  return new Promise<{ ok: boolean; status?: number; socket: WebSocket }>((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { origin, headers: host ? { Host: host } : undefined });
    sockets.push(socket);
    socket.on('open', () => resolve({ ok: true, socket }));
    socket.on('unexpected-response', (_req, res) => resolve({ ok: false, status: res.statusCode, socket }));
    socket.on('error', () => resolve({ ok: false, socket }));
  });
}

/** Collects JSON messages from the server as they arrive. */
function collect(socket: WebSocket) {
  const messages: ServerMessage[] = [];
  socket.on('message', (data, isBinary) => {
    if (!isBinary) messages.push(JSON.parse(data.toString()));
  });
  const waitFor = async (predicate: () => boolean) => {
    for (let i = 0; i < 200 && !predicate(); i++) await new Promise((r) => setTimeout(r, 10));
    expect(predicate()).toBe(true);
  };
  return { messages, waitFor };
}

describe('who may connect (pure rule)', () => {
  it.each([
    ['127.0.0.1:8787', undefined, true],
    ['localhost:5175', undefined, true],
    ['[::1]:8787', undefined, true],
    ['localhost:5175', 'http://localhost:5175', true],
    ['127.0.0.1:8787', 'http://127.0.0.1:8787', true],
    ['LOCALHOST:5175', 'http://localhost:5175', true],
    ['127.0.0.1:8787', 'https://example.com', false],
    ['127.0.0.1:8787', 'http://localhost:8787', false],
    ['127.0.0.1:8787', 'null', false],
    ['127.0.0.1:8787', '', false],
    ['attacker.example:8787', undefined, false],
    ['attacker.example:8787', 'http://attacker.example:8787', false],
    ['localhost.attacker.example', undefined, false],
    ['127.0.0.1.attacker.example', undefined, false],
    [undefined, undefined, false],
  ])('Host %j with Origin %j -> %s', (host, origin, expected) => {
    expect(isAllowedRequest({ host, origin })).toBe(expected);
  });
});

describe('/ws endpoint', () => {
  it('accepts a connection from the local machine', async () => {
    const { port } = await startWithStt();

    expect((await tryConnect(port)).ok).toBe(true);
  });

  it('accepts the app page itself (matching local Origin)', async () => {
    const { port } = await startWithStt();

    expect((await tryConnect(port, { origin: `http://127.0.0.1:${port}` })).ok).toBe(true);
  });

  it('refuses a page from another site', async () => {
    const { port } = await startWithStt();

    const result = await tryConnect(port, { origin: 'https://example.com' });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('refuses a non-local Host (DNS rebinding)', async () => {
    const { port } = await startWithStt();

    const result = await tryConnect(port, { host: `attacker.example:${port}`, origin: `http://attacker.example:${port}` });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('refuses other paths', async () => {
    const { port } = await startWithStt();

    expect((await tryConnect(port, { path: '/other' })).ok).toBe(false);
  });

  it('runs a whole session: start, audio, sentence, stop', async () => {
    const { port, stt } = await startWithStt();
    const { socket } = await tryConnect(port);
    const { messages, waitFor } = collect(socket);

    socket.send(JSON.stringify(validStart));
    await waitFor(() => stt.opened.length === 1);
    expect(messages[0]).toEqual({ type: 'status', state: 'connecting' });

    socket.send(new Uint8Array([1, 2, 3]));
    await waitFor(() => stt.opened[0].sent.length === 1);
    expect(Array.from(stt.opened[0].sent[0])).toEqual([1, 2, 3]);

    stt.opened[0].handlers.onResult({ transcript: 'Guten Tag.', isFinal: true, speechFinal: false });
    await waitFor(() => messages.some((m) => m.type === 'sentence'));
    expect(messages.find((m) => m.type === 'sentence')).toEqual({ type: 'sentence', id: 1, text: 'Guten Tag.' });

    const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
    socket.send(JSON.stringify({ type: 'stop' }));
    await closed;
    expect(messages.at(-1)).toEqual({ type: 'status', state: 'stopped' });
    expect(stt.opened[0].closeCalls).toBe(1);
  });

  it('closes recognition when the browser just disconnects', async () => {
    const { port, stt } = await startWithStt();
    const { socket } = await tryConnect(port);
    const { waitFor } = collect(socket);
    socket.send(JSON.stringify(validStart));
    await waitFor(() => stt.opened.length === 1);

    socket.terminate();

    await waitFor(() => stt.opened[0].closeCalls === 1);
  });

  it('drops a connection that sends a message larger than 1 MiB', async () => {
    const { port } = await startWithStt();
    const { socket } = await tryConnect(port);
    const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));

    socket.send(new Uint8Array(1024 * 1024 + 1));

    expect(await closed).toBe(1009);
  });
});
