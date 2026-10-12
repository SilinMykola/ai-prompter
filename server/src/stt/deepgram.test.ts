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
// The first chunk of every webm recording starts with these 4 bytes (the EBML header).
const header = (n: number) => new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, n]);

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

    // Until the restarted recording begins (a chunk with the webm header), chunks are useless and dropped.
    stream.send(chunk(99));
    stream.send(header(100));
    stream.send(chunk(101));
    expect(sockets[0].audio).toEqual([header(100), chunk(101)]);
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

// Opens the stream and makes the connection "good": open plus a first message from the service.
function connectAndReceive(sockets: ReturnType<typeof setup>['sockets'], index = 0) {
  sockets[index].open();
  sockets[index].receive({ type: 'Metadata' });
}

describe('reconnecting', () => {
  it('tells the caller, retries after 0.5 s, and asks for a recorder restart once open again', () => {
    const { sockets, h } = setup();
    connectAndReceive(sockets);

    sockets[0].drop();
    expect(h.onReconnecting).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1].open();
    expect(h.onOpen).toHaveBeenCalledTimes(2);
    expect(h.onRestartRecorder).toHaveBeenCalledTimes(1);
  });

  it('reuses the same URL and key for every attempt', () => {
    const { sockets } = setup('de');
    connectAndReceive(sockets);
    sockets[0].drop();
    vi.advanceTimersByTime(500);

    expect(sockets[1].url).toBe(sockets[0].url);
    expect(sockets[1].headers).toEqual(sockets[0].headers);
  });

  it('backs off 0.5, 1, 2, 4, 8 seconds and then gives up with a fatal error', () => {
    const { sockets, h } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();

    const delays = [500, 1000, 2000, 4000, 8000];
    delays.forEach((delay, i) => {
      vi.advanceTimersByTime(delay - 1);
      expect(sockets).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(i + 2);
      sockets[i + 1].drop(); // the attempt fails without ever opening
    });

    expect(h.onFatal).toHaveBeenCalledTimes(1);
    expect(h.onFatal).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connection' }));
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(6);
  });

  it('reports "reconnecting" once per outage, not once per failed attempt', () => {
    const { sockets, h } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();
    vi.advanceTimersByTime(500);
    sockets[1].drop();
    vi.advanceTimersByTime(1000);

    expect(h.onReconnecting).toHaveBeenCalledTimes(1);
  });

  it('starts the schedule over after a connection that worked', () => {
    const { sockets } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();
    vi.advanceTimersByTime(500);
    sockets[1].drop(); // a failed attempt: next delay would be 1 s
    vi.advanceTimersByTime(1000);
    connectAndReceive(sockets, 2); // this one works
    sockets[2].drop();

    vi.advanceTimersByTime(500);

    expect(sockets).toHaveLength(4);
  });

  it('discards audio while reconnecting (it would not start with a container header)', () => {
    const { stream, sockets } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();

    stream.send(chunk(1));
    vi.advanceTimersByTime(500);
    sockets[1].open();
    stream.send(header(2));

    expect(sockets[1].audio).toEqual([header(2)]);
  });

  it('after a reconnect, drops old-recording chunks until the restarted recording begins', () => {
    const { stream, sockets } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();
    vi.advanceTimersByTime(500);
    sockets[1].open();

    stream.send(chunk(7)); // still from the old recording, no header
    stream.send(chunk(8));
    stream.send(header(9)); // the restarted recorder
    stream.send(chunk(10));

    expect(sockets[1].audio).toEqual([header(9), chunk(10)]);
  });

  it('ignores late messages from a connection it has already replaced', () => {
    const { sockets, h } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();
    vi.advanceTimersByTime(500);
    sockets[1].open();

    sockets[0].receive(resultMessage('stale', true));

    expect(h.onResult).not.toHaveBeenCalled();
  });

  it('does not reconnect after close()', async () => {
    const { stream, sockets, h } = setup();
    connectAndReceive(sockets);
    const closing = stream.close();
    sockets[0].drop(1000);
    await closing;

    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
    expect(h.onReconnecting).not.toHaveBeenCalled();
  });

  it('cancels a pending retry when closed during an outage', async () => {
    const { stream, sockets } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();

    await stream.close();
    vi.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
  });

  it('survives an error event on the socket', () => {
    const { sockets, h } = setup();

    expect(() => sockets[0].emit('error', new Error('socket hang up'))).not.toThrow();
    expect(h.onFatal).not.toHaveBeenCalled();
  });
});

describe('first connection', () => {
  it('retries when the first attempt fails and keeps the audio that was waiting', () => {
    const { stream, sockets, h } = setup();
    stream.send(chunk(1));

    sockets[0].reject(503);
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
    sockets[1].open();

    expect(sockets[1].audio).toEqual([chunk(1)]);
    expect(h.onRestartRecorder).not.toHaveBeenCalled();
  });
});

describe('rejected key', () => {
  it.each([401, 403])('is fatal at once for HTTP %i, without retries', (status) => {
    const { sockets, h } = setup();

    sockets[0].reject(status);
    vi.advanceTimersByTime(60_000);

    expect(h.onFatal).toHaveBeenCalledTimes(1);
    expect(h.onFatal).toHaveBeenCalledWith(expect.objectContaining({ kind: 'auth' }));
    expect(sockets).toHaveLength(1);
    expect(sockets[0].terminateCalls).toBe(1);
    expect(h.onReconnecting).not.toHaveBeenCalled();
  });
});

describe('privacy', () => {
  it('never logs transcript text', () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { sockets, stream, log } = setup();
    connectAndReceive(sockets);

    sockets[0].receive(resultMessage('geheimer Satz', true, true));
    sockets[0].drop();
    vi.advanceTimersByTime(500);
    void stream.close();

    const everything = JSON.stringify([log.mock.calls, ...consoleSpies.map((spy) => spy.mock.calls)]);
    expect(everything).not.toContain('geheimer');
    expect(log).toHaveBeenCalled(); // events are logged, just not their text
    consoleSpies.forEach((spy) => spy.mockRestore());
  });
});

describe('review fixes', () => {
  it('terminates an attempt that is still connecting when closed during an outage', async () => {
    const { stream, sockets, h } = setup();
    connectAndReceive(sockets);
    sockets[0].drop();
    vi.advanceTimersByTime(500); // attempt 2 starts connecting
    expect(sockets).toHaveLength(2);

    await stream.close();
    sockets[1].open(); // the handshake finishes anyway: nobody listens any more

    expect(sockets[1].terminateCalls).toBe(1);
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it('resets the retry schedule after a connection stayed open for 5 seconds, even in silence', () => {
    const { sockets } = setup();
    sockets[0].open(); // no message ever arrives (silence)
    vi.advanceTimersByTime(5000);
    sockets[0].drop();
    vi.advanceTimersByTime(500);
    sockets[1].open();
    vi.advanceTimersByTime(5000);
    sockets[1].drop();

    vi.advanceTimersByTime(500);

    expect(sockets).toHaveLength(3); // still the first delay (0.5 s) each time
  });

  it('does not reset the schedule for connections that open and drop at once', () => {
    const { sockets, h } = setup();
    sockets[0].open();
    sockets[0].drop();
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(8000);
      sockets[i].open();
      sockets[i].drop();
    }

    expect(h.onFatal).toHaveBeenCalledTimes(1);
  });

  it('close() can be called twice: one CloseStream, one promise', async () => {
    const { stream, sockets } = setup();
    sockets[0].open();

    const first = stream.close();
    const second = stream.close();
    sockets[0].drop(1000);
    await Promise.all([first, second]);

    expect(sockets[0].text.filter((t) => t.includes('CloseStream'))).toHaveLength(1);
  });

  it.each([400, 404])('treats HTTP %i as fatal (a retry cannot help)', (status) => {
    const { sockets, h } = setup();

    sockets[0].reject(status);
    vi.advanceTimersByTime(60_000);

    expect(h.onFatal).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connection' }));
    expect(sockets).toHaveLength(1);
  });

  it.each([429, 503])('retries after HTTP %i', (status) => {
    const { sockets, h } = setup();

    sockets[0].reject(status);
    vi.advanceTimersByTime(500);

    expect(sockets).toHaveLength(2);
    expect(h.onFatal).not.toHaveBeenCalled();
  });

  it('does not throw when the socket refuses to send (audio and KeepAlive)', () => {
    const { stream, sockets } = setup();
    sockets[0].open();
    sockets[0].send = () => {
      throw new Error('not open');
    };

    expect(() => stream.send(chunk(1))).not.toThrow();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });

  it('understands messages delivered as ArrayBuffer or as a list of buffers', () => {
    const { sockets, h } = setup();
    sockets[0].open();
    const json = JSON.stringify(resultMessage('Hallo.', true));
    const bytes = Buffer.from(json);

    sockets[0].emit('message', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), false);
    sockets[0].emit('message', [bytes.subarray(0, 10), bytes.subarray(10)], false);

    expect(h.onResult).toHaveBeenCalledTimes(2);
  });
});
