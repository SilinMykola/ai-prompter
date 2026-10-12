import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, ServerMessage, StartMessage } from '@ai-prompter/shared/protocol';
import { createConnection, type ConnectionOptions, type WebSocketLike } from './connection';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// A stand-in for the browser's WebSocket: records what is sent and lets the test play the server.
class FakeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Array<string | ArrayBuffer | Uint8Array> = [];
  closeCalls = 0;

  constructor(readonly url: string) {}

  send(data: string | ArrayBuffer | Uint8Array): void {
    this.sent.push(data);
  }
  close(): void {
    this.closeCalls++;
  }

  // --- the test plays the server ---
  open() {
    this.onopen?.();
  }
  receive(message: ServerMessage | string) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }
  drop() {
    this.onclose?.();
  }

  /** Text messages the client sent, parsed. */
  get json(): ClientMessage[] {
    return this.sent.filter((d): d is string => typeof d === 'string').map((d) => JSON.parse(d));
  }
  get audio() {
    return this.sent.filter((d) => typeof d !== 'string');
  }
}

const startSettings: Omit<StartMessage, 'type'> = {
  language: 'de',
  provider: 'gemini',
  translationModel: 'fast',
  hintModel: 'strong',
  callContext: 'Arzttermin',
  profile: 'Name: Test',
};

function setup() {
  const sockets: FakeSocket[] = [];
  const calls = {
    messages: [] as ServerMessage[],
    ready: [] as boolean[],
    reconnecting: 0,
    gaveUp: 0,
    unavailable: [] as number[],
  };
  const options: ConnectionOptions = {
    url: 'ws://test/ws',
    start: startSettings,
    onMessage: (m) => calls.messages.push(m),
    onSessionReady: (isReconnect) => calls.ready.push(isReconnect),
    onReconnecting: () => calls.reconnecting++,
    onGaveUp: () => calls.gaveUp++,
    onCardUnavailable: (id) => calls.unavailable.push(id),
    createSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
  const connection = createConnection(options);
  return { connection, sockets, calls };
}

const status = (state: 'connecting' | 'listening' = 'connecting'): ServerMessage => ({ type: 'status', state });
const chunk = (n: number) => new Uint8Array([n]);

/** First session up and confirmed by the server. */
function connected() {
  const kit = setup();
  kit.sockets[0].open();
  kit.sockets[0].receive(status());
  return kit;
}

/** Drops the connection and brings up the next one, confirmed by the server. */
function reconnect(kit: ReturnType<typeof setup>, index: number, waitMs = 500) {
  kit.sockets[index - 1].drop();
  vi.advanceTimersByTime(waitMs);
  kit.sockets[index].open();
  kit.sockets[index].receive(status());
}

describe('starting', () => {
  it('connects to the given address and sends "start" with the settings first', () => {
    const { sockets } = setup();
    expect(sockets[0].url).toBe('ws://test/ws');

    sockets[0].open();

    expect(sockets[0].json).toEqual([{ type: 'start', ...startSettings }]);
  });

  it('drops audio until the server has confirmed the session, then sends it', () => {
    const { connection, sockets } = setup();
    connection.sendAudio(chunk(1)); // not open yet
    sockets[0].open();
    connection.sendAudio(chunk(2)); // open, but no answer to "start" yet
    expect(sockets[0].audio).toEqual([]);

    sockets[0].receive(status());
    connection.sendAudio(chunk(3));

    expect(sockets[0].audio).toEqual([chunk(3)]);
  });

  it('tells the caller the session is ready, once, and that it is not a reconnect', () => {
    const { sockets, calls } = setup();
    sockets[0].open();

    sockets[0].receive(status('connecting'));
    sockets[0].receive(status('listening'));

    expect(calls.ready).toEqual([false]);
  });
});

describe('messages from the server', () => {
  it('are passed on in order', () => {
    const { sockets, calls } = connected();

    sockets[0].receive({ type: 'sentence', id: 1, text: 'Eins.' });
    sockets[0].receive({ type: 'error', message: 'Беда' });

    expect(calls.messages).toEqual([
      status(),
      { type: 'sentence', id: 1, text: 'Eins.' },
      { type: 'error', message: 'Беда' },
    ]);
  });

  it('are ignored when they are not JSON', () => {
    const { sockets, calls } = connected();
    const before = calls.messages.length;

    sockets[0].receive('this is not json');
    sockets[0].receive('null');

    expect(calls.messages).toHaveLength(before);
  });
});

describe('reconnecting', () => {
  it('retries after 0.5 s, sends a new "start", and reports a ready reconnect once confirmed', () => {
    const kit = connected();

    kit.sockets[0].drop();
    expect(kit.calls.reconnecting).toBe(1);
    vi.advanceTimersByTime(499);
    expect(kit.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(kit.sockets).toHaveLength(2);

    kit.sockets[1].open();
    expect(kit.sockets[1].json).toEqual([{ type: 'start', ...startSettings }]);
    expect(kit.calls.ready).toEqual([false]);
    kit.sockets[1].receive(status());

    expect(kit.calls.ready).toEqual([false, true]);
  });

  it('backs off 0.5, 1, 2, 4, 8 seconds and then gives up', () => {
    const kit = connected();
    kit.sockets[0].drop();

    [500, 1000, 2000, 4000, 8000].forEach((delay, i) => {
      vi.advanceTimersByTime(delay - 1);
      expect(kit.sockets).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(kit.sockets).toHaveLength(i + 2);
      kit.sockets[i + 1].drop(); // the attempt fails
    });

    expect(kit.calls.gaveUp).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(kit.sockets).toHaveLength(6);
  });

  it('reports the outage once, however many retries it takes', () => {
    const kit = connected();
    kit.sockets[0].drop();
    vi.advanceTimersByTime(500);
    kit.sockets[1].drop();
    vi.advanceTimersByTime(1000);

    expect(kit.calls.reconnecting).toBe(1);
  });

  it('starts the schedule over after a connection that stayed up for 5 seconds', () => {
    const kit = connected();
    kit.sockets[0].drop();
    vi.advanceTimersByTime(500);
    kit.sockets[1].drop(); // a failed attempt: the next wait would be 1 s
    vi.advanceTimersByTime(1000);
    kit.sockets[2].open();
    kit.sockets[2].receive(status());
    vi.advanceTimersByTime(5000);
    kit.sockets[2].drop();

    vi.advanceTimersByTime(500);

    expect(kit.sockets).toHaveLength(4);
  });

  it('drops audio while the connection is down', () => {
    const kit = connected();
    kit.sockets[0].drop();

    kit.connection.sendAudio(chunk(1));
    vi.advanceTimersByTime(500);
    kit.sockets[1].open();
    kit.sockets[1].receive(status());
    kit.connection.sendAudio(chunk(2));

    expect(kit.sockets[1].audio).toEqual([chunk(2)]);
  });
});

describe('sentence ids across server sessions', () => {
  const sentence = (id: number): ServerMessage => ({ type: 'sentence', id, text: `Satz ${id}.` });
  const ids = (calls: ReturnType<typeof setup>['calls']) =>
    calls.messages.flatMap((m) => ('id' in m ? [m.id] : []));

  it('are shifted after a reconnect so they never repeat', () => {
    const kit = connected();
    [1, 2, 3].forEach((id) => kit.sockets[0].receive(sentence(id)));
    reconnect(kit, 1);

    kit.sockets[1].receive(sentence(1));
    kit.sockets[1].receive({ type: 'translation_delta', id: 1, delta: 'x' });
    kit.sockets[1].receive({ type: 'hint_done', id: 1 });

    expect(ids(kit.calls)).toEqual([1, 2, 3, 4, 4, 4]);
  });

  it('keep shifting across several reconnects', () => {
    const kit = connected();
    kit.sockets[0].receive(sentence(1));
    kit.sockets[0].receive(sentence(2));
    reconnect(kit, 1); // offset 2
    kit.sockets[1].receive(sentence(1)); // 3
    reconnect(kit, 2, 1000); // offset 3 (the first connection was not up for 5 s, so the wait grew)
    kit.sockets[2].receive(sentence(1)); // 4

    expect(ids(kit.calls)).toEqual([1, 2, 3, 4]);
  });

  it('are translated back for requests about a card of the current session', () => {
    const kit = connected();
    [1, 2, 3].forEach((id) => kit.sockets[0].receive(sentence(id)));
    reconnect(kit, 1);
    kit.sockets[1].receive(sentence(1)); // card 4
    kit.sockets[1].receive(sentence(2)); // card 5

    kit.connection.requestHint(5, 'detailed');
    kit.connection.retranslate(4);

    expect(kit.sockets[1].json.slice(1)).toEqual([
      { type: 'hint', id: 2, mode: 'detailed' },
      { type: 'retranslate', id: 1 },
    ]);
  });

  it('refuse requests about a card of an older session and say so', () => {
    const kit = connected();
    [1, 2, 3].forEach((id) => kit.sockets[0].receive(sentence(id)));
    reconnect(kit, 1);

    kit.connection.requestHint(2, 'short');
    kit.connection.retranslate(3);

    expect(kit.sockets[1].json).toHaveLength(1); // only "start"
    expect(kit.calls.unavailable).toEqual([2, 3]);
  });

  it('send requests unchanged in the first session', () => {
    const kit = connected();

    kit.connection.requestHint(1, 'short');

    expect(kit.sockets[0].json.at(-1)).toEqual({ type: 'hint', id: 1, mode: 'short' });
  });
});

describe('stopping', () => {
  it('sends "stop", waits for the server to close, and does not reconnect', async () => {
    const kit = connected();

    const stopping = kit.connection.stop();
    expect(kit.sockets[0].json.at(-1)).toEqual({ type: 'stop' });
    kit.sockets[0].receive({ type: 'sentence', id: 1, text: 'Letzter Satz.' }); // last words still arrive
    kit.sockets[0].drop();
    await stopping;
    vi.advanceTimersByTime(60_000);

    expect(kit.calls.messages.at(-1)).toEqual({ type: 'sentence', id: 1, text: 'Letzter Satz.' });
    expect(kit.sockets).toHaveLength(1);
    expect(kit.calls.reconnecting).toBe(0);
  });

  it('closes the socket itself when the server does not answer within 2 seconds', async () => {
    const kit = connected();

    const stopping = kit.connection.stop();
    await vi.advanceTimersByTimeAsync(1999);
    expect(kit.sockets[0].closeCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await stopping;

    expect(kit.sockets[0].closeCalls).toBe(1);
  });

  it('closes at once when the connection is not open', async () => {
    const kit = setup();

    await kit.connection.stop();

    expect(kit.sockets[0].closeCalls).toBe(1);
    expect(kit.sockets[0].json).toEqual([]);
  });

  it('cancels a pending retry', async () => {
    const kit = connected();
    kit.sockets[0].drop();

    await kit.connection.stop();
    vi.advanceTimersByTime(60_000);

    expect(kit.sockets).toHaveLength(1);
  });

  it('can be called twice', async () => {
    const kit = connected();

    const first = kit.connection.stop();
    const second = kit.connection.stop();
    kit.sockets[0].drop();
    await Promise.all([first, second]);

    expect(kit.sockets[0].json.filter((m) => m.type === 'stop')).toHaveLength(1);
  });
});
