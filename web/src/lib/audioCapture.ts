import type { AudioSource } from './settings';

// Getting the call's sound in the browser and cutting it into small pieces for the server.
//
// Two sources: a Chrome tab (the browser's "share screen" dialog, with the "also share tab
// audio" checkbox) or the microphone. In both cases the sound is recorded with MediaRecorder
// as webm/opus, delivering a chunk every 250 ms.

/** Something the user can understand and fix. The message is shown on screen. */
export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureError';
  }
}

const NO_TAB_AUDIO_MESSAGE = 'Звук не захвачен. Выберите вкладку Chrome и включите «Также поделиться звуком вкладки».';
const NO_MIC_AUDIO_MESSAGE = 'Микрофон не отдаёт звук. Проверьте, что он подключён и разрешён в браузере.';
const MIME_TYPE = 'audio/webm;codecs=opus';
const CHUNK_MS = 250;

/** The browser APIs we use. Tests pass fakes; the defaults are the real ones. */
export interface CaptureDeps {
  getDisplayMedia(constraints: { video: boolean; audio: boolean }): Promise<MediaStream>;
  getUserMedia(constraints: { audio: boolean }): Promise<MediaStream>;
  MediaRecorder: typeof MediaRecorder;
  MediaStream: typeof MediaStream;
}

export interface Capture {
  /** Starts recording; `onChunk` gets the bytes of each 250 ms piece, in order. */
  start(onChunk: (chunk: Uint8Array) => void): void;
  /** Starts a new recording on the same sound: its first chunk carries a fresh webm header. */
  restart(): void;
  /** Stops everything and releases the tab/microphone. Safe to call more than once. */
  stop(): void;
}

function defaultDeps(): CaptureDeps {
  return {
    getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints),
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    MediaRecorder,
    MediaStream,
  };
}

// Turns the browser's error names into a sentence for the user.
function explain(error: unknown): CaptureError {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError') return new CaptureError('Доступ не предоставлен. Разрешите захват звука и попробуйте снова.');
  if (name === 'NotFoundError') return new CaptureError('Источник звука не найден (микрофон не подключён?).');
  return new CaptureError('Не удалось получить звук. Попробуйте снова.');
}

export async function createCapture(
  source: AudioSource,
  options: { onEnded(): void },
  deps: CaptureDeps = defaultDeps(),
): Promise<Capture> {
  let stream: MediaStream;
  try {
    // video: true is required for the tab dialog to appear at all. We never use the video.
    stream = source === 'tab' ? await deps.getDisplayMedia({ video: true, audio: true }) : await deps.getUserMedia({ audio: true });
  } catch (error) {
    throw explain(error);
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((track) => track.stop()); // otherwise the browser keeps showing "sharing"
    throw new CaptureError(source === 'tab' ? NO_TAB_AUDIO_MESSAGE : NO_MIC_AUDIO_MESSAGE);
  }

  // The recorder gets only the audio. The video track stays untouched (and running) until we stop.
  const audioStream = new deps.MediaStream(audioTracks);

  let stopped = false;
  let ended = false;
  for (const track of stream.getTracks()) {
    // "ended" also fires when *we* stop a track; only report the user's own "Stop sharing".
    track.addEventListener('ended', () => {
      if (stopped || ended) return;
      ended = true;
      options.onEnded();
    });
  }

  let recorder: MediaRecorder | undefined;
  let onChunk: ((chunk: Uint8Array) => void) | undefined;
  // reading a Blob is asynchronous; chaining the reads keeps the chunks in order
  let delivery: Promise<void> = Promise.resolve();

  function record(): void {
    if (!deps.MediaRecorder.isTypeSupported(MIME_TYPE)) {
      throw new CaptureError('Этот браузер не умеет записывать звук в формате webm/opus. Используйте Chrome.');
    }
    const current = new deps.MediaRecorder(audioStream, { mimeType: MIME_TYPE });
    current.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      delivery = delivery
        .then(async () => {
          const bytes = new Uint8Array(await event.data.arrayBuffer());
          if (!stopped && recorder === current) onChunk?.(bytes); // nothing from a replaced recorder
        })
        // One bad chunk (unreadable data, a handler that throws) must not stop all the later ones.
        .catch(() => {});
    };
    recorder = current;
    current.start(CHUNK_MS);
  }

  function stopRecorder(): void {
    if (!recorder) return;
    recorder.ondataavailable = null; // late data of this recorder is not wanted
    if (recorder.state !== 'inactive') recorder.stop();
    recorder = undefined;
  }

  return {
    start(callback) {
      if (stopped) return;
      onChunk = callback;
      stopRecorder();
      record();
    },
    restart() {
      if (stopped) return;
      stopRecorder();
      record();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      stopRecorder();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
