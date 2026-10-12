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

const resultMessage = (transcript: string, isFinal: boolean, speechFinal = false) => ({
  type: 'Results',
  is_final: isFinal,
  speech_final: speechFinal,
  channel: { alternatives: [{ transcript, confidence: 0.9 }] },
});

describe('recognition events', () => {
  it('passes interim and final results on with their flags', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    sockets[0].receive(resultMessage('Guten Ta', false));
    sockets[0].receive(resultMessage('Guten Tag.', true, true));

    expect(h.onResult.mock.calls).toEqual([
      [{ transcript: 'Guten Ta', isFinal: false, speechFinal: false }],
      [{ transcript: 'Guten Tag.', isFinal: true, speechFinal: true }],
    ]);
  });

  it('passes an empty final result on (it can still carry speech_final)', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    sockets[0].receive(resultMessage('', true, true));

    expect(h.onResult).toHaveBeenCalledWith({ transcript: '', isFinal: true, speechFinal: true });
  });

  it('reports an utterance end', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    sockets[0].receive({ type: 'UtteranceEnd', channel: [0, 1], last_word_end: 2.4 });

    expect(h.onUtteranceEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores an utterance end with last_word_end -1', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    sockets[0].receive({ type: 'UtteranceEnd', channel: [0, 1], last_word_end: -1 });

    expect(h.onUtteranceEnd).not.toHaveBeenCalled();
  });

  it('reports the start of speech', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    sockets[0].receive({ type: 'SpeechStarted', channel: [0, 1], timestamp: 1.2 });

    expect(h.onSpeechStarted).toHaveBeenCalledTimes(1);
  });

  it('ignores messages it does not know and text that is not JSON', () => {
    const { sockets, h } = setup();
    sockets[0].open();

    sockets[0].receive({ type: 'Metadata', request_id: 'x' });
    sockets[0].receive({ type: 'Something new' });
    sockets[0].receive('this is not json');
    sockets[0].receive({ type: 'Results' }); // result without a channel
    sockets[0].receive('null');

    expect(h.onResult).not.toHaveBeenCalled();
    expect(h.onUtteranceEnd).not.toHaveBeenCalled();
    expect(h.onFatal).not.toHaveBeenCalled();
  });
});

describe('keep-alive', () => {
  it('sends KeepAlive as a text message after 4 seconds without audio', () => {
    const { sockets } = setup();
    sockets[0].open();

    vi.advanceTimersByTime(3999);
    expect(sockets[0].text).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(sockets[0].text).toEqual(['{"type":"KeepAlive"}']);
  });

  it('keeps sending it every 4 seconds of silence', () => {
    const { sockets } = setup();
    sockets[0].open();

    vi.advanceTimersByTime(12_000);

    expect(sockets[0].text).toHaveLength(3);
  });

  it('does not send it while audio keeps flowing', () => {
    const { stream, sockets } = setup();
    sockets[0].open();

    for (let i = 0; i < 12; i++) {
      stream.send(chunk(i));
      vi.advanceTimersByTime(1000);
    }

    expect(sockets[0].text).toEqual([]);
  });

  it('does not wait for the first 4 seconds when audio was sent before the connection opened', () => {
    const { stream, sockets } = setup();
    stream.send(chunk(1));
    vi.advanceTimersByTime(3000);
    sockets[0].open();

    vi.advanceTimersByTime(3999);

    expect(sockets[0].text).toEqual([]);
  });
});

describe('closing', () => {
  it('sends CloseStream and waits for the service to close the connection', async () => {
    const { stream, sockets } = setup();
    sockets[0].open();

    let closed = false;
    const closing = stream.close().then(() => (closed = true));

    expect(sockets[0].text).toContain('{"type":"CloseStream"}');
    await vi.advanceTimersByTimeAsync(1000);
    expect(closed).toBe(false);

    sockets[0].drop(1000);
    await closing;
    expect(closed).toBe(true);
  });

  it('still delivers results that arrive while closing', async () => {
    const { stream, sockets, h } = setup();
    sockets[0].open();
    const closing = stream.close();

    sockets[0].receive(resultMessage('Letzte Worte.', true, true));
    sockets[0].drop(1000);
    await closing;

    expect(h.onResult).toHaveBeenCalledWith({ transcript: 'Letzte Worte.', isFinal: true, speechFinal: true });
  });

  it('closes the connection anyway after 2 seconds and then delivers nothing more', async () => {
    const { stream, sockets, h } = setup();
    sockets[0].open();
    const closing = stream.close();

    await vi.advanceTimersByTimeAsync(2000);
    await closing;
    sockets[0].receive(resultMessage('too late', true));

    expect(sockets[0].terminateCalls).toBe(1);
    expect(h.onResult).not.toHaveBeenCalled();
  });

  it('sends no KeepAlive after closing and does not report a reconnect', async () => {
    const { stream, sockets, h } = setup();
    sockets[0].open();
    const closing = stream.close();
    sockets[0].drop(1000);
    await closing;

    await vi.advanceTimersByTimeAsync(20_000);

    expect(sockets[0].text).toEqual(['{"type":"CloseStream"}']);
    expect(h.onReconnecting).not.toHaveBeenCalled();
  });

  it('can be closed before the connection opens', async () => {
    const { stream, sockets } = setup();

    const closing = stream.close();
    await vi.advanceTimersByTimeAsync(2000);
    await closing;

    expect(sockets[0].terminateCalls).toBe(1);
  });
});
