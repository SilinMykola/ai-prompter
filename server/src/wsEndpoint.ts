import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ServerMessage } from '@ai-prompter/shared/protocol';
import type { Registry } from './llm';
import { createSession } from './session';
import type { SttProvider } from './stt/types';

// The /ws endpoint: connects browser WebSockets to call sessions.

const WS_PATH = '/ws';

// Audio chunks are a few kilobytes. A limit stops a broken or hostile client from filling memory.
const MAX_MESSAGE_BYTES = 1024 * 1024;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Who may open a session?
 *
 * The server listens on 127.0.0.1, which keeps other computers out. But any web page open in
 * the user's browser can still try `new WebSocket('ws://127.0.0.1:8787/ws')` and use the
 * user's API keys. Two checks stop that:
 *  - `Host` must be a local name (a page on attacker.example that re-points its DNS name at
 *    127.0.0.1, "DNS rebinding", still sends its own name in `Host`);
 *  - if the browser sent an `Origin` (browsers always do for WebSockets), it must be the same
 *    host as `Host`, so only our own page qualifies. A request without `Origin` comes from a
 *    program on this machine, not from a web page.
 */
export function isAllowedRequest({ host, origin }: { host?: string; origin?: string }): boolean {
  if (!host) return false;
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  if (!LOCAL_HOSTNAMES.has(hostname.toLowerCase())) return false;

  if (origin === undefined) return true;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false; // "null" or garbage
  }
}

export interface WsDeps {
  stt: SttProvider;
  registry: Pick<Registry, 'get' | 'modelsOf'>;
  log?: (event: string) => void;
}

function refuse(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function attachWsEndpoint(server: Server, deps: WsDeps): void {
  const log = deps.log ?? (() => {});
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  function onConnection(ws: WebSocket): void {
    const session = createSession({
      send: (message: ServerMessage) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
      },
      close: () => ws.close(),
      stt: deps.stt,
      registry: deps.registry,
      log,
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        session.onBinary(data as Buffer);
      } else {
        session.onText(data.toString()).catch(() => {
          log('session_error internal');
          ws.close();
        });
      }
    });
    ws.on('close', () => session.onClose());
    // Without an 'error' listener a socket error would crash the process; 'close' follows anyway.
    ws.on('error', () => log('ws_error'));
  }

  // The HTTP server hands us every upgrade request; we only accept /ws from local pages.
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== WS_PATH) return refuse(socket, '404 Not Found');

    if (!isAllowedRequest({ host: request.headers.host, origin: request.headers.origin })) {
      log('ws_refused');
      return refuse(socket, '403 Forbidden');
    }
    wss.handleUpgrade(request, socket, head, onConnection);
  });
}
