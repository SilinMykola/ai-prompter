import type { ClientMessage, HintMode, ServerMessage, StartMessage } from '@ai-prompter/shared/protocol';

// The browser's connection to the server for one call.
//
// It does four jobs so that the rest of the app does not have to:
//  1. sends `start` first, and keeps audio away from the server until the server has answered;
//  2. reconnects after a lost connection (up to 5 times, with growing waits);
//  3. keeps sentence ids unique even though every new server session counts from 1 again;
//  4. stops politely.

/** The few WebSocket features we use (the browser's `WebSocket` fits; tests pass a fake). */
export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(): void;
}

export interface ConnectionOptions {
  url: string;
  /** The settings for the `start` message (everything except its `type`). */
  start: Omit<StartMessage, 'type'>;
  /** A message from the server, with its sentence id already made unique. */
  onMessage(message: ServerMessage): void;
  /** The server accepted a session. `isReconnect` is true after a lost connection: restart the recorder. */
  onSessionReady(isReconnect: boolean): void;
  /** The connection was lost; reconnecting. Called once per outage. */
  onReconnecting(): void;
  /** All retries failed. */
  onGaveUp(): void;
  /** A request was refused because the card belongs to an older server session. */
  onCardUnavailable(id: number): void;
  createSocket?: (url: string) => WebSocketLike;
}

export interface Connection {
  /** Sends a chunk of audio; dropped silently if no session is ready. */
  sendAudio(chunk: ArrayBuffer | Uint8Array): void;
  requestHint(id: number, mode: HintMode): void;
  retranslate(id: number): void;
  /** Ends the call. Resolves when the server has closed the connection (or after 2 seconds). */
  stop(): Promise<void>;
}

// Waits before reconnect attempts 1..5. After the fifth failed attempt we give up.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
// A connection that stayed up this long counts as healthy: the next loss starts at 0.5 s again.
const STABLE_AFTER_MS = 5000;
const STOP_TIMEOUT_MS = 2000;

export function createConnection(options: ConnectionOptions): Connection {
  const createSocket = options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);

  let socket: WebSocketLike;
  let isOpen = false; // the socket is open
  let isReady = false; // ...and the server has answered our `start`
  let hasBeenReady = false; // some earlier socket was ready: the next one is a reconnect
  let inOutage = false;
  let retries = 0;
  let stopping = false;
  let idOffset = 0; // added to every id the server sends
  let maxId = 0; // the highest id handed to the app so far
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let stopPromise: Promise<void> | undefined;
  let finishStop: (() => void) | undefined;

  function sendJson(message: ClientMessage): void {
    socket.send(JSON.stringify(message));
  }

  function handleServerMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: ServerMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message !== 'object' || message === null || typeof message.type !== 'string') return;

    // The first answer after `start` means the server accepted the session.
    if (!isReady) {
      isReady = true;
      options.onSessionReady(hasBeenReady);
      hasBeenReady = true;
    }

    // Every server session numbers its sentences from 1. Shift them so the app sees
    // one continuous numbering (messages about a sentence all carry the same `id`).
    if ('id' in message && typeof message.id === 'number') {
      const id = message.id + idOffset;
      maxId = Math.max(maxId, id);
      message = { ...message, id } as ServerMessage;
    }
    options.onMessage(message);
  }

  function scheduleRetry(): void {
    if (retries >= RETRY_DELAYS_MS.length) {
      options.onGaveUp();
      return;
    }
    if (!inOutage) {
      inOutage = true;
      options.onReconnecting();
    }
    retryTimer = setTimeout(connect, RETRY_DELAYS_MS[retries++]);
  }

  function connect(): void {
    const current = createSocket(options.url);
    socket = current;
    isOpen = false;
    isReady = false;

    current.onopen = () => {
      isOpen = true;
      inOutage = false;
      // A new server session counts its sentences from 1: continue after the highest id we have.
      if (hasBeenReady) idOffset = maxId;
      sendJson({ type: 'start', ...options.start });
      stableTimer = setTimeout(() => (retries = 0), STABLE_AFTER_MS);
    };
    current.onmessage = (event) => {
      if (socket === current) handleServerMessage(event.data);
    };
    current.onerror = () => {}; // `onclose` follows and drives the reconnect
    current.onclose = () => {
      if (socket !== current) return;
      isOpen = false;
      isReady = false;
      clearTimeout(stableTimer);
      if (stopping) {
        clearTimeout(stopTimer);
        finishStop?.();
      } else {
        scheduleRetry();
      }
    };
  }

  // Translates a card id of the app into the id the current server session knows.
  // Returns undefined when the card belongs to an older session (the server never heard of it).
  function serverIdFor(id: number): number | undefined {
    const serverId = id - idOffset;
    return serverId >= 1 ? serverId : undefined;
  }

  function request(id: number, build: (serverId: number) => ClientMessage): void {
    if (!isOpen || !isReady) return;
    const serverId = serverIdFor(id);
    if (serverId === undefined) {
      options.onCardUnavailable(id);
      return;
    }
    sendJson(build(serverId));
  }

  connect();

  return {
    sendAudio(chunk) {
      if (isOpen && isReady && !stopping) socket.send(chunk);
    },
    requestHint: (id, mode) => request(id, (serverId) => ({ type: 'hint', id: serverId, mode })),
    retranslate: (id) => request(id, (serverId) => ({ type: 'retranslate', id: serverId })),
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      clearTimeout(retryTimer);
      clearTimeout(stableTimer);
      stopPromise = new Promise<void>((resolve) => {
        finishStop = resolve;
        if (isOpen) {
          sendJson({ type: 'stop' });
          // The server closes the connection after it has sent the last words.
          stopTimer = setTimeout(() => {
            socket.close();
            resolve();
          }, STOP_TIMEOUT_MS);
        } else {
          socket.close();
          resolve();
        }
      });
      return stopPromise;
    },
  };
}
