import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeepgramProvider } from './deepgram';
import { fakeSocketFactory } from './fakeSocket';
import type { SttHandlers } from './types';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function handlers() {
  return {
    onOpen: vi.fn(),
    onResult: vi.fn(),
    onUtteranceEnd: vi.fn(),
    onSpeechStarted: vi.fn(),
    onReconnecting: vi.fn(),
    onRestartRecorder: vi.fn(),
    onFatal: vi.fn(),
  } satisfies SttHandlers;
}

function setup(language: 'de' | 'en' | 'multi' = 'multi') {
  const { factory, sockets } = fakeSocketFactory();
  const log = vi.fn();
  const provider = createDeepgramProvider({ apiKey: 'KEY-123', model: 'nova-3', createSocket: factory, log });
  const h = handlers();
  const stream = provider.open({ language }, h);
  return { stream, sockets, h, log };
}

const chunk = (n: number) => new Uint8Array([n, n, n]);

describe('connection', () => {
  it('connects with the documented query parameters', () => {
    const { sockets } = setup('multi');

    const url = new URL(sockets[0].url);

    expect(`${url.origin}${url.pathname}`).toBe('wss://api.deepgram.com/v1/listen');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model: 'nova-3',
      language: 'multi',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
      vad_events: 'true',
    });
  });

  it.each(['de', 'en', 'multi'] as const)('passes the language %s on', (language) => {
    const { sockets } = setup(language);

    expect(new URL(sockets[0].url).searchParams.get('language')).toBe(language);
  });

  it('sends the key only in the Authorization header', () => {
    const { sockets } = setup();

    expect(sockets[0].headers.Authorization).toBe('Token KEY-123');
    expect(sockets[0].url).not.toContain('KEY-123');
  });

  it('tells the caller when the connection is open', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('audio forwarding', () => {
  it('sends chunks unchanged and in order once open', () => {
    const { stream, sockets } = setup();
    sockets[0].open();

    stream.send(chunk(1));
    stream.send(chunk(2));

    expect(sockets[0].audio).toEqual([chunk(1), chunk(2)]);
  });

  it('holds chunks that arrive before the connection opens, then sends them first', () => {
    const { stream, sockets } = setup();

    stream.send(chunk(1));
    stream.send(chunk(2));
    stream.send(chunk(3));
    expect(sockets[0].audio).toEqual([]);

    sockets[0].open();
    stream.send(chunk(4));

    expect(sockets[0].audio).toEqual([chunk(1), chunk(2), chunk(3), chunk(4)]);
  });

  it('holds up to 5 seconds of audio (20 chunks of 250 ms)', () => {
    const { stream, sockets, h } = setup();
    for (let i = 0; i < 20; i++) stream.send(chunk(i));

    sockets[0].open();

    expect(sockets[0].audio).toHaveLength(20);
    expect(h.onRestartRecorder).not.toHaveBeenCalled();
  });

  it('drops the held audio and asks for a recorder restart when it would exceed 5 seconds', () => {
    const { stream, sockets, h } = setup();
    for (let i = 0; i < 21; i++) stream.send(chunk(i));

    expect(h.onRestartRecorder).toHaveBeenCalledTimes(1);
    sockets[0].open();
    expect(sockets[0].audio).toEqual([]);

    // After the restart the new header and following chunks are held again as usual.
    stream.send(chunk(100));
    expect(sockets[0].audio).toEqual([chunk(100)]);
  });
});
