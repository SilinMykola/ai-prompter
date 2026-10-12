import { describe, expect, it, vi } from 'vitest';
import { CaptureError, createCapture, type CaptureDeps } from './audioCapture';

// --- fakes for the browser's media objects ---

class FakeTrack {
  stopped = false;
  private listeners: Array<() => void> = [];
  constructor(readonly kind: 'audio' | 'video') {}
  stop() {
    this.stopped = true;
  }
  addEventListener(type: string, listener: () => void) {
    if (type === 'ended') this.listeners.push(listener);
  }
  /** The user clicked "Stop sharing" in the browser. */
  end() {
    this.listeners.forEach((l) => l());
  }
}

class FakeStream {
  constructor(private tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static supported = true;
  static isTypeSupported = () => FakeRecorder.supported;
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: { size: number; arrayBuffer(): Promise<ArrayBuffer> } }) => void) | null = null;
  startedWith: number | undefined;
  constructor(
    readonly stream: FakeStream,
    readonly options: { mimeType: string },
  ) {
    FakeRecorder.instances.push(this);
  }
  start(timeslice: number) {
    this.state = 'recording';
    this.startedWith = timeslice;
  }
  stop() {
    this.state = 'inactive';
  }
  /** The recorder produced a chunk (arrayBuffer may take a while, as in a browser). */
  produce(bytes: number[], delayMs = 0) {
    const data = {
      size: bytes.length,
      arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => setTimeout(() => resolve(new Uint8Array(bytes).buffer), delayMs)),
    };
    this.ondataavailable?.({ data });
  }
}

function setup(options: { audio?: boolean; video?: boolean } = {}) {
  FakeRecorder.instances = [];
  FakeRecorder.supported = true;
  const video = new FakeTrack('video');
  const audio = new FakeTrack('audio');
  const tracks = [...(options.video === false ? [] : [video]), ...(options.audio === false ? [] : [audio])];
  const stream = new FakeStream(tracks);
  const deps = {
    getDisplayMedia: vi.fn(async () => stream),
    getUserMedia: vi.fn(async () => stream),
    MediaRecorder: FakeRecorder,
    MediaStream: FakeStream,
  } as unknown as CaptureDeps;
  return { deps, stream, video, audio, onEnded: vi.fn() };
}

const lastRecorder = () => FakeRecorder.instances.at(-1)!;

describe('tab capture', () => {
  it('asks for screen sharing with video and audio', async () => {
    const { deps, onEnded } = setup();

    await createCapture('tab', { onEnded }, deps);

    expect(deps.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(deps.getUserMedia).not.toHaveBeenCalled();
  });

  it('fails with a clear message and stops every track when no audio came along', async () => {
    const { deps, video, onEnded } = setup({ audio: false });

    const attempt = createCapture('tab', { onEnded }, deps);

    await expect(attempt).rejects.toBeInstanceOf(CaptureError);
    await expect(attempt).rejects.toThrow(/Звук не захвачен.*Также поделиться звуком вкладки/);
    expect(video.stopped).toBe(true);
  });

  it('records the audio only and leaves the video track running', async () => {
    const { deps, video, audio, onEnded } = setup();

    const capture = await createCapture('tab', { onEnded }, deps);
    capture.start(() => {});

    const recorderInput = lastRecorder().stream;
    expect(recorderInput.getTracks()).toEqual([audio]);
    expect(video.stopped).toBe(false);
  });
});

describe('microphone', () => {
  it('asks for audio only', async () => {
    const { deps, onEnded } = setup({ video: false });

    const capture = await createCapture('mic', { onEnded }, deps);
    capture.start(() => {});

    expect(deps.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(deps.getDisplayMedia).not.toHaveBeenCalled();
    expect(lastRecorder().state).toBe('recording');
  });
});

describe('recording', () => {
  it('uses webm/opus with a 250 ms time slice', async () => {
    const { deps, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);

    capture.start(() => {});

    expect(lastRecorder().options).toEqual({ mimeType: 'audio/webm;codecs=opus' });
    expect(lastRecorder().startedWith).toBe(250);
  });

  it('refuses to start when the browser cannot record webm/opus', async () => {
    const { deps, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);
    FakeRecorder.supported = false;

    expect(() => capture.start(() => {})).toThrow(CaptureError);
  });

  it('delivers the bytes of non-empty chunks in order, even if reading one is slow', async () => {
    vi.useFakeTimers();
    const { deps, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);
    const chunks: number[][] = [];
    capture.start((chunk) => chunks.push(Array.from(chunk)));

    lastRecorder().produce([1], 50); // slow
    lastRecorder().produce([], 0); // empty: skipped
    lastRecorder().produce([2], 0); // fast, but must not overtake the first
    await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();

    expect(chunks).toEqual([[1], [2]]);
  });

  it('restarts on the same audio, with a new recorder, and stops delivering from the old one', async () => {
    const { deps, audio, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);
    const chunks: number[][] = [];
    capture.start((chunk) => chunks.push(Array.from(chunk)));
    const first = lastRecorder();

    capture.restart();
    first.produce([9]); // late data from the old recorder
    await new Promise((r) => setTimeout(r, 5));
    lastRecorder().produce([7]);
    await new Promise((r) => setTimeout(r, 5));

    expect(FakeRecorder.instances).toHaveLength(2);
    expect(first.state).toBe('inactive');
    expect(lastRecorder().state).toBe('recording');
    expect(lastRecorder().stream.getTracks()).toEqual([audio]);
    expect(chunks).toEqual([[7]]);
  });
});

describe('ending', () => {
  it('tells the caller once when a track ends', async () => {
    const { deps, video, audio, onEnded } = setup();
    await createCapture('tab', { onEnded }, deps);

    video.end();
    audio.end();

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('stops the recorder and all tracks, including video, and delivers nothing afterwards', async () => {
    const { deps, video, audio, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);
    const chunks: number[][] = [];
    capture.start((chunk) => chunks.push(Array.from(chunk)));

    capture.stop();
    lastRecorder().produce([1]);
    await new Promise((r) => setTimeout(r, 5));

    expect(lastRecorder().state).toBe('inactive');
    expect(video.stopped).toBe(true);
    expect(audio.stopped).toBe(true);
    expect(chunks).toEqual([]);
  });

  it('can be stopped twice, or before it was started', async () => {
    const { deps, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);

    expect(() => {
      capture.stop();
      capture.stop();
    }).not.toThrow();
  });

  it('does not call onEnded for a stop the app asked for', async () => {
    const { deps, audio, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);

    capture.stop();
    audio.end(); // stopping a track makes the browser fire "ended"

    expect(onEnded).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it.each([
    ['NotAllowedError', /доступ не предоставлен/i],
    ['NotFoundError', /не найден/i],
    ['SomethingElse', /не удалось получить звук/i],
  ])('explains %s in Russian', async (name, message) => {
    const { deps, onEnded } = setup();
    deps.getDisplayMedia = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name });
    });

    await expect(createCapture('tab', { onEnded }, deps)).rejects.toThrow(message);
  });
});

describe('review fixes', () => {
  it('keeps delivering after one chunk fails to read or to be handled', async () => {
    const { deps, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);
    const chunks: number[][] = [];
    let first = true;
    capture.start((chunk) => {
      if (first) {
        first = false;
        throw new Error('socket closing'); // the handler fails once
      }
      chunks.push(Array.from(chunk));
    });

    lastRecorder().produce([1]);
    lastRecorder().produce([2]);
    lastRecorder().ondataavailable?.({ data: { size: 1, arrayBuffer: () => Promise.reject(new Error('unreadable')) } });
    lastRecorder().produce([3]);
    await new Promise((r) => setTimeout(r, 10));

    expect(chunks).toEqual([[2], [3]]);
  });

  it('does not start or restart a recording after stop', async () => {
    const { deps, onEnded } = setup();
    const capture = await createCapture('tab', { onEnded }, deps);
    capture.stop();

    capture.start(() => {});
    capture.restart();

    expect(FakeRecorder.instances).toHaveLength(0);
  });

  it('does not tell a microphone user to share a tab', async () => {
    const { deps, onEnded } = setup({ audio: false, video: false });

    const attempt = createCapture('mic', { onEnded }, deps);

    await expect(attempt).rejects.toThrow(/микрофон/i);
    await expect(attempt).rejects.not.toThrow(/вкладк/i);
  });
});
