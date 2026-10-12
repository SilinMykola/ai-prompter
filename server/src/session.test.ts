import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from './session';
import { fakeConnection, fakeRegistry, fakeStt, types, validStart } from './sessionTestKit';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(overrides: Partial<Parameters<typeof createSession>[0]> = {}) {
  const connection = fakeConnection();
  const stt = fakeStt();
  const log = vi.fn();
  const session = createSession({
    send: connection.send,
    close: connection.close,
    stt: stt.provider,
    registry: fakeRegistry,
    log,
    ...overrides,
  });
  return { session, connection, stt, log };
}

const start = (session: ReturnType<typeof setup>['session'], message: object = validStart) =>
  session.onText(JSON.stringify(message));

describe('session start', () => {
  it('answers a valid start with "connecting" and opens recognition for the language', async () => {
    const { session, connection, stt } = setup();

    await start(session);

    expect(connection.messages).toEqual([{ type: 'status', state: 'connecting' }]);
    expect(stt.opened).toHaveLength(1);
    expect(stt.opened[0].language).toBe('de');
    expect(connection.close).not.toHaveBeenCalled();
  });

  it('passes the chosen language on', async () => {
    const { session, stt } = setup();

    await start(session, { ...validStart, language: 'multi' });

    expect(stt.opened[0].language).toBe('multi');
  });

  it('rejects an invalid start with a Russian error and closes', async () => {
    const { session, connection, stt } = setup();

    await start(session, { ...validStart, provider: 'anthropic' });

    expect(types(connection.messages)).toEqual(['error']);
    expect(connection.messages[0]).toMatchObject({ message: expect.stringMatching(/недоступен/) });
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(stt.opened).toHaveLength(0);
  });

  it('rejects a first message that is not "start"', async () => {
    const { session, connection } = setup();

    await session.onText(JSON.stringify({ type: 'stop' }));

    expect(types(connection.messages)).toEqual(['error']);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('rejects a first message that is not JSON', async () => {
    const { session, connection } = setup();

    await session.onText('hello');

    expect(types(connection.messages)).toEqual(['error']);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('rejects audio that arrives before start', () => {
    const { session, connection } = setup();

    session.onBinary(new Uint8Array([1]));

    expect(types(connection.messages)).toEqual(['error']);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('gives up when no start arrives within 10 seconds', () => {
    const { session, connection } = setup();
    void session;

    vi.advanceTimersByTime(9999);
    expect(connection.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(types(connection.messages)).toEqual(['error']);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('does not time out after a valid start', async () => {
    const { session, connection } = setup();
    await start(session);

    vi.advanceTimersByTime(60_000);

    expect(connection.close).not.toHaveBeenCalled();
  });

  it('answers a second start with an error and keeps running', async () => {
    const { session, connection, stt } = setup();
    await start(session);

    await start(session);

    expect(types(connection.messages)).toEqual(['status', 'error']);
    expect(connection.close).not.toHaveBeenCalled();
    expect(stt.opened).toHaveLength(1);
    session.onBinary(new Uint8Array([7]));
    expect(stt.opened[0].sent).toHaveLength(1);
  });
});

describe('audio', () => {
  it('is forwarded unchanged to recognition', async () => {
    const { session, stt } = setup();
    await start(session);
    const chunk = new Uint8Array([1, 2, 3]);

    session.onBinary(chunk);

    expect(stt.opened[0].sent).toEqual([chunk]);
  });

  it('that arrives while start is still being checked is dropped, not an error', async () => {
    let release!: () => void;
    const slowRegistry = {
      ...fakeRegistry,
      modelsOf: (id: Parameters<typeof fakeRegistry.modelsOf>[0]) =>
        new Promise<string[]>((resolve) => (release = () => resolve(fakeRegistry.modelsOf(id)))),
    };
    const { session, connection, stt } = setup({ registry: slowRegistry });

    const starting = start(session);
    session.onBinary(new Uint8Array([9]));
    release();
    await starting;

    expect(types(connection.messages)).toEqual(['status']);
    expect(stt.opened[0].sent).toEqual([]);
  });
});

// Starts a session and returns the handlers the session gave to the recognition stream,
// so a test can play the speech service.
async function running() {
  const kit = setup();
  await start(kit.session);
  kit.connection.messages.length = 0; // forget the "connecting" status
  return { ...kit, service: kit.stt.opened[0].handlers };
}

const final = (transcript: string, speechFinal = false) => ({ transcript, isFinal: true, speechFinal });
const interim = (transcript: string) => ({ transcript, isFinal: false, speechFinal: false });

describe('status reporting', () => {
  it('says "listening" when recognition is connected', async () => {
    const { service, connection } = await running();

    service.onOpen();

    expect(connection.messages).toEqual([{ type: 'status', state: 'listening' }]);
  });

  it('says "speaking" when speech starts and "listening" when the utterance ends', async () => {
    const { service, connection } = await running();

    service.onSpeechStarted();
    service.onUtteranceEnd();

    expect(connection.messages.filter((m) => m.type === 'status')).toEqual([
      { type: 'status', state: 'speaking' },
      { type: 'status', state: 'listening' },
    ]);
  });

  it('reports an outage and the recovery with a recorder restart', async () => {
    const { service, connection } = await running();

    service.onReconnecting();
    service.onOpen();
    service.onRestartRecorder();

    expect(connection.messages).toEqual([
      { type: 'status', state: 'reconnecting' },
      { type: 'status', state: 'listening' },
      { type: 'restart_recorder' },
    ]);
  });
});

describe('live text and sentences', () => {
  it('sends finished sentences with increasing ids, then the unfinished rest as interim', async () => {
    const { service, connection } = await running();

    service.onResult(final('Guten Tag. Wie geht'));

    expect(connection.messages).toEqual([
      { type: 'sentence', id: 1, text: 'Guten Tag.' },
      { type: 'interim', finalText: 'Wie geht', interimText: '' },
    ]);
  });

  it('numbers sentences across results', async () => {
    const { service, connection } = await running();

    service.onResult(final('Eins.'));
    service.onResult(final('Zwei.'));

    const ids = connection.messages.filter((m) => m.type === 'sentence').map((m) => (m as { id: number }).id);
    expect(ids).toEqual([1, 2]);
  });

  it('sends an interim result as live text without a sentence', async () => {
    const { service, connection } = await running();

    service.onResult(interim('Wie geht es'));

    expect(connection.messages).toEqual([{ type: 'interim', finalText: '', interimText: 'Wie geht es' }]);
  });

  it('flushes the unfinished phrase when the utterance ends', async () => {
    const { service, connection } = await running();
    service.onResult(final('Ich komme gleich'));
    connection.messages.length = 0;

    service.onUtteranceEnd();

    expect(connection.messages).toEqual([
      { type: 'sentence', id: 1, text: 'Ich komme gleich' },
      { type: 'interim', finalText: '', interimText: '' },
      { type: 'status', state: 'listening' },
    ]);
  });

  it('flushes on speech_final', async () => {
    const { service, connection } = await running();

    service.onResult(final('Danke schön', true));

    expect(connection.messages[0]).toEqual({ type: 'sentence', id: 1, text: 'Danke schön' });
  });
});

describe('ending a session', () => {
  it('on stop: delivers words still arriving, then "stopped", then hangs up', async () => {
    const { session, service, stt, connection } = await running();
    stt.opened[0].whileClosing = () => service.onResult(final('Letzte Worte.'));

    await session.onText(JSON.stringify({ type: 'stop' }));

    expect(connection.messages).toEqual([
      { type: 'sentence', id: 1, text: 'Letzte Worte.' },
      { type: 'interim', finalText: '', interimText: '' },
      { type: 'interim', finalText: '', interimText: '' },
      { type: 'status', state: 'stopped' },
    ]);
    expect(stt.opened[0].closeCalls).toBe(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('on stop: flushes an unfinished phrase as a last sentence', async () => {
    const { session, service, connection } = await running();
    service.onResult(final('Und dann'));
    connection.messages.length = 0;

    await session.onText(JSON.stringify({ type: 'stop' }));

    expect(connection.messages[0]).toEqual({ type: 'sentence', id: 1, text: 'Und dann' });
    expect(connection.messages.at(-1)).toEqual({ type: 'status', state: 'stopped' });
  });

  it('sends nothing after it has ended', async () => {
    const { session, service, connection } = await running();
    await session.onText(JSON.stringify({ type: 'stop' }));
    const countAtEnd = connection.messages.length;

    service.onResult(final('Zu spät.'));
    service.onSpeechStarted();
    session.onBinary(new Uint8Array([1]));
    await session.onText(JSON.stringify({ type: 'hint', id: 1, mode: 'short' }));

    expect(connection.messages).toHaveLength(countAtEnd);
  });

  it('stop during the start check ends the session without opening recognition', async () => {
    let release!: () => void;
    const slowRegistry = {
      ...fakeRegistry,
      modelsOf: (id: Parameters<typeof fakeRegistry.modelsOf>[0]) =>
        new Promise<string[]>((resolve) => (release = () => resolve(fakeRegistry.modelsOf(id)))),
    };
    const { session, connection, stt } = setup({ registry: slowRegistry });

    const starting = start(session);
    await session.onText(JSON.stringify({ type: 'stop' }));
    release();
    await starting;

    expect(stt.opened).toHaveLength(0);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('closes recognition when the browser disappears, without sending anything', async () => {
    const { session, stt, connection } = await running();

    session.onClose();

    expect(stt.opened[0].closeCalls).toBe(1);
    expect(connection.messages).toEqual([]);
    expect(connection.close).not.toHaveBeenCalled();
  });

  it('closes recognition when the browser disappears during the start check', async () => {
    let release!: () => void;
    const slowRegistry = {
      ...fakeRegistry,
      modelsOf: (id: Parameters<typeof fakeRegistry.modelsOf>[0]) =>
        new Promise<string[]>((resolve) => (release = () => resolve(fakeRegistry.modelsOf(id)))),
    };
    const { session, stt } = setup({ registry: slowRegistry });

    const starting = start(session);
    session.onClose();
    release();
    await starting;

    expect(stt.opened).toHaveLength(0);
  });
});

describe('recognition failures', () => {
  it('reports a rejected key in Russian, then stops', async () => {
    const { service, connection, stt } = await running();

    service.onFatal({ kind: 'auth', message: 'x' });

    expect(types(connection.messages)).toEqual(['error', 'status']);
    expect(connection.messages[0]).toMatchObject({ message: expect.stringMatching(/ключ/) });
    expect(connection.messages[1]).toEqual({ type: 'status', state: 'stopped' });
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(stt.opened[0].closeCalls).toBe(1);
  });

  it('reports a lost connection in Russian, then stops', async () => {
    const { service, connection } = await running();

    service.onFatal({ kind: 'connection', message: 'x' });

    expect(connection.messages[0]).toMatchObject({ type: 'error', message: expect.stringMatching(/подключ/) });
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});

describe('bad input in a running session', () => {
  it('answers text that is not JSON with an error and keeps running', async () => {
    const { session, connection, stt } = await running();

    await session.onText('this is not json');
    session.onBinary(new Uint8Array([5]));

    expect(types(connection.messages)).toEqual(['error']);
    expect(connection.close).not.toHaveBeenCalled();
    expect(stt.opened[0].sent).toHaveLength(1);
  });

  it('answers an unknown message type with an error', async () => {
    const { session, connection } = await running();

    await session.onText(JSON.stringify({ type: 'dance' }));

    expect(types(connection.messages)).toEqual(['error']);
  });

  it.each([
    { type: 'hint', id: 1, mode: 'short' },
    { type: 'retranslate', id: 1 },
  ])('accepts and ignores %j until it is implemented', async (message) => {
    const { session, connection } = await running();

    await session.onText(JSON.stringify(message));

    expect(connection.messages).toEqual([]);
    expect(connection.close).not.toHaveBeenCalled();
  });
});

describe('privacy', () => {
  it('never logs or errors with recognised text, context or profile', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { session, service, connection, log } = await running();

    service.onResult(final('GEHEIMSATZ eins. GEHEIMSATZ zwei', true));
    await session.onText('GEHEIMSATZ kein JSON');
    service.onFatal({ kind: 'connection', message: 'GEHEIMSATZ' });
    await session.onText(JSON.stringify({ type: 'stop' }));

    const logged = JSON.stringify([log.mock.calls, ...consoleSpies.map((spy) => spy.mock.calls)]);
    expect(logged).not.toContain('GEHEIMSATZ');
    expect(logged).not.toContain('CONTEXT-TEXT');
    expect(logged).not.toContain('PROFILE-TEXT');
    const errors = JSON.stringify(connection.messages.filter((m) => m.type === 'error'));
    expect(errors).not.toContain('GEHEIMSATZ');
    expect(log).toHaveBeenCalled(); // events are logged, just not their content
    consoleSpies.forEach((spy) => spy.mockRestore());
  });
});

describe('review fixes', () => {
  it('is not revived when recognition fails synchronously while opening', async () => {
    const kit = setup();
    const closed: string[] = [];
    kit.stt.provider.open = (_options, handlers) => {
      handlers.onFatal({ kind: 'auth', message: 'x' }); // fails before open() even returns
      return { send: () => closed.push('audio'), close: async () => void closed.push('closed') };
    };

    await start(kit.session);
    kit.session.onBinary(new Uint8Array([1]));
    await Promise.resolve();

    expect(types(kit.connection.messages)).toEqual(['status', 'error', 'status']);
    expect(closed).toEqual(['closed']); // the stream was closed and never got audio
    expect(kit.connection.close).toHaveBeenCalledTimes(1);
  });

  it('survives a recognition stream whose close() fails', async () => {
    const kit = setup();
    kit.stt.provider.open = () => ({
      send: () => {},
      close: () => Promise.reject(new Error('socket error')),
    });
    await start(kit.session);

    // An unhandled rejection would fail this test run.
    kit.session.onClose();
    await vi.advanceTimersByTimeAsync(0); // let any rejection surface
  });

  it('tells the user when starting fails unexpectedly', async () => {
    const failingRegistry = { ...fakeRegistry, modelsOf: () => Promise.reject(new Error('boom')) };
    const { session, connection, log } = setup({ registry: failingRegistry });

    await start(session);

    expect(connection.messages).toEqual([{ type: 'error', message: expect.stringMatching(/Не удалось начать/) }]);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain('boom');
  });

  it('tells the user when opening recognition throws', async () => {
    const kit = setup();
    kit.stt.provider.open = () => {
      throw new Error('cannot open');
    };

    await start(kit.session);

    expect(types(kit.connection.messages)).toEqual(['status', 'error']); // "connecting" came first
    expect(kit.connection.close).toHaveBeenCalledTimes(1);
  });

  it('on stop during the start check, says "stopped" before hanging up', async () => {
    let release!: () => void;
    const slowRegistry = {
      ...fakeRegistry,
      modelsOf: (id: Parameters<typeof fakeRegistry.modelsOf>[0]) =>
        new Promise<string[]>((resolve) => (release = () => resolve(fakeRegistry.modelsOf(id)))),
    };
    const { session, connection } = setup({ registry: slowRegistry });

    const starting = start(session);
    await session.onText(JSON.stringify({ type: 'stop' }));
    release();
    await starting;

    expect(connection.messages).toEqual([{ type: 'status', state: 'stopped' }]);
  });

  it('answers a second start during the start check with an error', async () => {
    let release!: () => void;
    const slowRegistry = {
      ...fakeRegistry,
      modelsOf: (id: Parameters<typeof fakeRegistry.modelsOf>[0]) =>
        new Promise<string[]>((resolve) => (release = () => resolve(fakeRegistry.modelsOf(id)))),
    };
    const { session, connection, stt } = setup({ registry: slowRegistry });

    const starting = start(session);
    await start(session);
    release();
    await starting;

    expect(types(connection.messages)).toEqual(['error', 'status']);
    expect(stt.opened).toHaveLength(1);
  });
});
