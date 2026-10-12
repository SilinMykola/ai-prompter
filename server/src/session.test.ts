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
