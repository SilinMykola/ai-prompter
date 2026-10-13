import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, type SessionDeps } from './session';
import { fakeConnection, fakeRegistry, fakeStt, types, validStart } from './sessionTestKit';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(overrides: Partial<Parameters<typeof createSession>[0]> = {}) {
  const connection = fakeConnection();
  const stt = fakeStt();
  const log = vi.fn();
  // The older tests are about recognition, so translation is replaced by a function that does nothing.
  const translate = vi.fn<NonNullable<SessionDeps['translate']>>(async () => {});
  const hint = vi.fn<NonNullable<SessionDeps['hint']>>(async () => {});
  const session = createSession({
    send: connection.send,
    close: connection.close,
    stt: stt.provider,
    registry: fakeRegistry,
    log,
    translate,
    hint,
    ...overrides,
  });
  return { session, connection, stt, log, translate, hint };
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
  ])('accepts %j for a sentence that does not exist, silently', async (message) => {
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

describe('translation in the session', () => {
  const sentence = (text: string) => final(text);

  it('translates every sentence with the chosen model and the call context', async () => {
    const { service, translate } = await running();

    service.onResult(sentence('Guten Tag. Wie geht es Ihnen?'));

    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[0][0]).toMatchObject({
      model: 'fast',
      id: 1,
      restart: false,
      provider: fakeRegistry.get('gemini'),
      context: { callContext: 'CONTEXT-TEXT', previous: [], sentence: 'Guten Tag.' },
    });
    expect(translate.mock.calls[1][0]).toMatchObject({
      id: 2,
      context: { previous: ['Guten Tag.'], sentence: 'Wie geht es Ihnen?' },
    });
  });

  it('does not translate a sentence that is already in the target language', async () => {
    const { service, translate, connection } = await running();

    service.onResult(sentence('Здравствуйте, у меня есть вопрос. Ich habe einen Termin am Montag.'));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].context.sentence).toBe('Ich habe einen Termin am Montag.');
    // The Russian card is closed at once, so it shows no spinner and no failure.
    expect(connection.messages).toContainEqual({ type: 'translation_done', id: 1 });
  });

  it('translates into the language chosen on the setup screen', async () => {
    const kit = setup();
    await start(kit.session, { ...validStart, targetLanguage: 'de' });
    const service = kit.stt.opened[0].handlers;

    service.onResult(sentence('Здравствуйте, у меня есть вопрос. Ich habe einen Termin am Montag.'));

    expect(kit.translate).toHaveBeenCalledTimes(1);
    expect(kit.translate.mock.calls[0][0]).toMatchObject({
      context: { sentence: 'Здравствуйте, у меня есть вопрос.', targetLanguage: 'de' },
    });
  });

  it('starts the second translation without waiting for the first', async () => {
    const { service, translate } = await running();
    translate.mockImplementation(() => new Promise(() => {})); // never finishes

    service.onResult(sentence('Eins. Zwei.'));

    expect(translate).toHaveBeenCalledTimes(2);
  });

  it('gives each sentence the sentences before it as context', async () => {
    const { service, translate } = await running();

    service.onResult(sentence('S1. S2. S3. S4. S5. S6.'));

    expect(translate.mock.calls[5][0].context.previous).toEqual(['S2.', 'S3.', 'S4.', 'S5.']);
  });

  it('lets the translator send its messages to the browser', async () => {
    const { service, translate, connection } = await running();
    translate.mockImplementation(async (options) => {
      options.emit({ type: 'translation_delta', id: options.id, delta: 'Привет' });
      options.emit({ type: 'translation_done', id: options.id });
    });

    service.onResult(sentence('Hallo.'));
    await Promise.resolve();

    expect(connection.messages).toContainEqual({ type: 'translation_delta', id: 1, delta: 'Привет' });
    expect(connection.messages).toContainEqual({ type: 'translation_done', id: 1 });
  });

  it('never gives the profile to the translator', async () => {
    const { service, translate } = await running();

    service.onResult(sentence('Hallo.'));

    expect(JSON.stringify(translate.mock.calls.map(([options]) => options.context))).not.toContain('PROFILE-TEXT');
    expect(JSON.stringify(translate.mock.calls.map(([options]) => options.model))).not.toContain('PROFILE-TEXT');
  });

  it('restarts the translation of a known sentence on "retranslate", with the same context', async () => {
    const { session, service, translate } = await running();
    service.onResult(sentence('Eins. Zwei.'));
    translate.mockClear();

    await session.onText(JSON.stringify({ type: 'retranslate', id: 2 }));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).toMatchObject({
      id: 2,
      restart: true,
      context: { previous: ['Eins.'], sentence: 'Zwei.' },
    });
  });

  it.each([0, 3, -1, 1.5, 'x', null])('ignores "retranslate" for the unknown id %j', async (id) => {
    const { session, service, translate } = await running();
    service.onResult(sentence('Eins. Zwei.'));
    translate.mockClear();

    await session.onText(JSON.stringify({ type: 'retranslate', id }));

    expect(translate).not.toHaveBeenCalled();
  });

  it('reports a rejected key once per session, however many sentences fail', async () => {
    const { service, translate, connection } = await running();
    translate.mockImplementation(async (options) => options.onAuthError?.());

    service.onResult(sentence('Eins. Zwei. Drei.'));

    const errors = connection.messages.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ message: expect.stringMatching(/ключ/i) });
  });

  it('gives running translations up to 5 seconds to finish when stopping', async () => {
    const { session, service, translate, connection } = await running();
    translate.mockImplementation(async (options) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      options.emit({ type: 'translation_done', id: options.id });
    });
    service.onResult(sentence('Hallo.'));

    const stopping = session.onText(JSON.stringify({ type: 'stop' }));
    await vi.advanceTimersByTimeAsync(2000);
    await stopping;

    const done = connection.messages.findIndex((m) => m.type === 'translation_done');
    const stopped = connection.messages.findIndex((m) => m.type === 'status' && m.state === 'stopped');
    expect(done).toBeGreaterThan(-1);
    expect(done).toBeLessThan(stopped);
  });

  it('stops after 5 seconds even if a translation never finishes, and cancels it', async () => {
    const { session, service, translate, connection } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentence('Hallo.'));
    const signal = translate.mock.calls[0][0].signal!;

    const stopping = session.onText(JSON.stringify({ type: 'stop' }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(connection.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await stopping;

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
  });

  it('translates the last sentences that stopping itself flushes', async () => {
    const { session, service, translate } = await running();
    service.onResult(sentence('Und dann'));
    translate.mockClear();

    await session.onText(JSON.stringify({ type: 'stop' }));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0].context.sentence).toBe('Und dann');
  });

  it('cancels running translations when the browser disappears', async () => {
    const { session, service, translate } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentence('Hallo.'));
    const signal = translate.mock.calls[0][0].signal!;

    session.onClose();

    expect(signal.aborted).toBe(true);
  });

  it('cancels running translations when recognition fails for good', async () => {
    const { service, translate } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentence('Hallo.'));
    const signal = translate.mock.calls[0][0].signal!;

    service.onFatal({ kind: 'connection', message: 'x' });

    expect(signal.aborted).toBe(true);
  });

  it('cancels the running translation of a sentence when it is re-requested, so two never mix', async () => {
    const { session, service, translate } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentence('Eins.'));
    const first = translate.mock.calls[0][0].signal!;

    await session.onText(JSON.stringify({ type: 'retranslate', id: 1 }));
    const second = translate.mock.calls[1][0].signal!;

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('does not cancel the translations of other sentences', async () => {
    const { session, service, translate } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentence('Eins. Zwei.'));
    const other = translate.mock.calls[0][0].signal!;

    await session.onText(JSON.stringify({ type: 'retranslate', id: 2 }));

    expect(other.aborted).toBe(false);
  });

  it('survives a translator that throws before returning a promise', async () => {
    const { service, translate, connection } = await running();
    translate.mockImplementation(() => {
      throw new Error('sync boom');
    });

    expect(() => service.onResult(sentence('Eins. Zwei.'))).not.toThrow();

    expect(connection.messages.filter((m) => m.type === 'sentence')).toHaveLength(2); // the relay carries on
  });

  it('survives a translator that crashes', async () => {
    const { service, translate, connection } = await running();
    translate.mockImplementation(async () => {
      throw new Error('boom');
    });

    service.onResult(sentence('Hallo.'));
    await vi.advanceTimersByTimeAsync(0);

    expect(connection.close).not.toHaveBeenCalled();
  });

  it('works end to end with the real translator and a fake model', async () => {
    const modelRequests: string[] = [];
    const llm = {
      id: 'gemini',
      label: 'Gemini',
      listModels: async () => ['fast', 'strong'],
      stream: (request: { user: string }) => {
        modelRequests.push(request.user);
        return (async function* () {
          yield 'Добрый ';
          yield 'день.';
        })();
      },
    };
    const kit = setup({
      translate: undefined,
      registry: { get: () => llm as never, modelsOf: async () => ['fast', 'strong'] },
    });
    await start(kit.session);
    kit.connection.messages.length = 0;

    kit.stt.opened[0].handlers.onResult(sentence('Guten Tag.'));
    await vi.advanceTimersByTimeAsync(0);

    expect(kit.connection.messages.filter((m) => m.type.startsWith('translation'))).toEqual([
      { type: 'translation_delta', id: 1, delta: 'Добрый ' },
      { type: 'translation_delta', id: 1, delta: 'день.' },
      { type: 'translation_done', id: 1 },
    ]);
    expect(modelRequests[0]).toContain('<sentence>Guten Tag.</sentence>');
    expect(modelRequests[0]).not.toContain('PROFILE-TEXT');
  });
});

describe('hints in the session', () => {
  const sentences = (text: string) => final(text);
  const askHint = (session: ReturnType<typeof setup>['session'], id: number | unknown, mode: unknown = 'short') =>
    session.onText(JSON.stringify({ type: 'hint', id, mode }));

  it('builds a hint for a known sentence with the hint model, the call context, the profile and the earlier sentences', async () => {
    const { session, service, hint } = await running();
    service.onResult(sentences('Eins. Zwei.'));

    await askHint(session, 2, 'detailed');

    expect(hint).toHaveBeenCalledTimes(1);
    expect(hint.mock.calls[0][0]).toMatchObject({
      model: 'strong',
      id: 2,
      mode: 'detailed',
      provider: fakeRegistry.get('gemini'),
      context: { callContext: 'CONTEXT-TEXT', profile: 'PROFILE-TEXT', previous: ['Eins.'], sentence: 'Zwei.' },
    });
  });

  it('gives a hint the six sentences before the one it answers', async () => {
    const { session, service, hint } = await running();
    service.onResult(sentences('S1. S2. S3. S4. S5. S6. S7. S8.'));

    await askHint(session, 8);

    expect(hint.mock.calls[0][0].context.previous).toEqual(['S2.', 'S3.', 'S4.', 'S5.', 'S6.', 'S7.']);
  });

  it('ignores a hint request without a mode', async () => {
    const { session, service, hint } = await running();
    service.onResult(sentences('Eins.'));

    await session.onText(JSON.stringify({ type: 'hint', id: 1 }));

    expect(hint).not.toHaveBeenCalled();
  });

  it('produces nothing unless a hint is requested', async () => {
    const { service, hint } = await running();

    service.onResult(sentences('Eins. Zwei.'));

    expect(hint).not.toHaveBeenCalled();
  });

  it.each([0, 3, -1, 1.5, 'x', null])('ignores a hint for the unknown id %j', async (id) => {
    const { session, service, hint } = await running();
    service.onResult(sentences('Eins. Zwei.'));

    await askHint(session, id);

    expect(hint).not.toHaveBeenCalled();
  });

  it.each(['long', 5, null])('ignores the unknown mode %j', async (mode) => {
    const { session, service, hint } = await running();
    service.onResult(sentences('Eins.'));

    await askHint(session, 1, mode);

    expect(hint).not.toHaveBeenCalled();
  });

  it('lets the hint function send its messages to the browser', async () => {
    const { session, service, hint, connection } = await running();
    service.onResult(sentences('Eins.'));
    hint.mockImplementation(async (options) => {
      options.emit({ type: 'hint_start', id: options.id, mode: options.mode });
      options.emit({ type: 'hint_done', id: options.id });
    });

    await askHint(session, 1);
    await Promise.resolve();

    expect(connection.messages).toContainEqual({ type: 'hint_start', id: 1, mode: 'short' });
    expect(connection.messages).toContainEqual({ type: 'hint_done', id: 1 });
  });

  it('cancels the earlier hint of the same sentence, but not other hints or translations', async () => {
    const { session, service, hint, translate } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    hint.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentences('Eins. Zwei.'));

    await askHint(session, 1, 'short');
    await askHint(session, 2, 'short');
    const [firstOfOne, firstOfTwo] = hint.mock.calls.map(([options]) => options.signal!);
    await askHint(session, 1, 'detailed');
    const secondOfOne = hint.mock.calls[2][0].signal!;

    expect(firstOfOne.aborted).toBe(true);
    expect(secondOfOne.aborted).toBe(false);
    expect(firstOfTwo.aborted).toBe(false);
    expect(translate.mock.calls.every(([options]) => !options.signal!.aborted)).toBe(true);
  });

  it('reports a rejected key once for translation and hints together', async () => {
    const { session, service, hint, translate, connection } = await running();
    translate.mockImplementation(async (options) => options.onAuthError?.());
    hint.mockImplementation(async (options) => options.onAuthError?.());
    service.onResult(sentences('Eins.'));

    await askHint(session, 1);
    await askHint(session, 1);

    expect(connection.messages.filter((m) => m.type === 'error')).toHaveLength(1);
  });

  it('does not wait for hints on stop, and cancels them', async () => {
    const { session, service, hint, connection } = await running();
    hint.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentences('Eins.'));
    await askHint(session, 1);
    const signal = hint.mock.calls[0][0].signal!;

    await session.onText(JSON.stringify({ type: 'stop' })); // would hang here if it waited for the hint

    expect(signal.aborted).toBe(true);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('cancels hints at the start of stopping, while translations are still given time to finish', async () => {
    const { session, service, hint, translate, connection } = await running();
    translate.mockImplementation(() => new Promise(() => {}));
    hint.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentences('Eins.'));
    await askHint(session, 1);
    const hintSignal = hint.mock.calls[0][0].signal!;

    const stopping = session.onText(JSON.stringify({ type: 'stop' }));
    await vi.advanceTimersByTimeAsync(100);

    expect(connection.close).not.toHaveBeenCalled(); // still waiting for the translation
    expect(hintSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    await stopping;
  });

  it('forgets the controller of a finished hint, so a long call does not pile them up', async () => {
    const { session, service, hint } = await running();
    service.onResult(sentences('Eins.'));
    let finish!: () => void;
    hint.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));

    await askHint(session, 1);
    const signal = hint.mock.calls[0][0].signal!;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    hint.mockImplementation(() => new Promise(() => {}));
    await askHint(session, 1, 'detailed'); // a new request after the first finished: must not "cancel" anything finished

    expect(signal.aborted).toBe(false);
  });

  it('cancels hints when the browser disappears', async () => {
    const { session, service, hint } = await running();
    hint.mockImplementation(() => new Promise(() => {}));
    service.onResult(sentences('Eins.'));
    await askHint(session, 1);
    const signal = hint.mock.calls[0][0].signal!;

    session.onClose();

    expect(signal.aborted).toBe(true);
  });

  it('survives a hint function that crashes or throws at once', async () => {
    const { session, service, hint, connection } = await running();
    service.onResult(sentences('Eins.'));

    hint.mockImplementation(async () => {
      throw new Error('boom');
    });
    await askHint(session, 1);
    hint.mockImplementation(() => {
      throw new Error('sync boom');
    });
    await expect(askHint(session, 1)).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(0);

    expect(connection.close).not.toHaveBeenCalled();
  });

  it('ignores hint requests after the session ended', async () => {
    const { session, service, hint } = await running();
    service.onResult(sentences('Eins.'));
    await session.onText(JSON.stringify({ type: 'stop' }));
    hint.mockClear();

    await askHint(session, 1);

    expect(hint).not.toHaveBeenCalled();
  });

  it('works end to end with the real hint function and a fake model: the profile reaches the hint model only', async () => {
    const calls: Array<{ system: string; user: string; model: string }> = [];
    const llm = {
      id: 'gemini',
      label: 'Gemini',
      listModels: async () => ['fast', 'strong'],
      stream: (request: { system: string; user: string; model: string }) => {
        calls.push(request);
        return (async function* () {
          yield 'Ja, gern.';
        })();
      },
    };
    const kit = setup({ translate: undefined, hint: undefined, registry: { get: () => llm as never, modelsOf: async () => ['fast', 'strong'] } });
    await start(kit.session);
    kit.stt.opened[0].handlers.onResult(sentences('Haben Sie Zeit?'));
    await vi.advanceTimersByTimeAsync(0);
    kit.connection.messages.length = 0;

    await askHint(kit.session, 1, 'short');
    await vi.advanceTimersByTimeAsync(0);

    expect(kit.connection.messages.map((m) => m.type)).toEqual(['hint_start', 'hint_delta', 'hint_done']);
    const translation = calls.find((c) => c.model === 'fast')!;
    const hintCall = calls.find((c) => c.model === 'strong')!;
    expect(hintCall.system).toContain('PROFILE-TEXT');
    expect(translation.system).not.toContain('PROFILE-TEXT');
    expect(translation.user).not.toContain('PROFILE-TEXT');
  });
});
