import type { AudioSource } from './settings';

// Getting the call's sound in the browser and cutting it into small pieces for the server.
//
// Three sources: a Chrome tab (the browser's "share screen" dialog, with the "also share tab
// audio" checkbox), the entire screen with system audio (for a call in a desktop app such as
// Zoom), or the microphone. In all cases the sound is recorded with MediaRecorder as webm/opus,
// delivering a chunk every 250 ms.

/** Something the user can understand and fix. The message is shown on screen. */
export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureError';
  }
}

const NO_TAB_AUDIO_MESSAGE = 'Звук не захвачен. Выберите вкладку Chrome и включите «Также поделиться звуком вкладки».';
const NO_SCREEN_AUDIO_MESSAGE = 'Звук не захвачен. Выберите «Весь экран» и включите «Также поделиться системным звуком».';
const NO_MIC_AUDIO_MESSAGE = 'Микрофон не отдаёт звук. Проверьте, что он подключён и разрешён в браузере.';
const MIME_TYPE = 'audio/webm;codecs=opus';
const CHUNK_MS = 250;

// `systemAudio` is a Chrome option that the TypeScript DOM types do not know yet.
type DisplayConstraints = { video: boolean | { displaySurface: 'monitor' }; audio: boolean; systemAudio?: 'include' };

// What to ask the share dialog for. The entire screen is preselected for the screen source, and
// system audio is what carries the sound of another app (macOS 14.2+ with Chrome 141+).
const DISPLAY_REQUEST: Record<'tab' | 'screen', DisplayConstraints> = {
  // video: true is required for the tab dialog to appear at all. We never use the video.
  tab: { video: true, audio: true },
  screen: { video: { displaySurface: 'monitor' }, audio: true, systemAudio: 'include' },
};

const NO_AUDIO_MESSAGE: Record<AudioSource, string> = {
  tab: NO_TAB_AUDIO_MESSAGE,
  screen: NO_SCREEN_AUDIO_MESSAGE,
  mic: NO_MIC_AUDIO_MESSAGE,
};

/** The browser APIs we use. Tests pass fakes; the defaults are the real ones. */
export interface CaptureDeps {
  getDisplayMedia(constraints: DisplayConstraints): Promise<MediaStream>;
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
    getDisplayMedia: (constraints) => navigator.mediaDevices.getDisplayMedia(constraints as DisplayMediaStreamOptions),
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
    stream = source === 'mic' ? await deps.getUserMedia({ audio: true }) : await deps.getDisplayMedia(DISPLAY_REQUEST[source]);
  } catch (error) {
    throw explain(error);
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    stream.getTracks().forEach((track) => track.stop()); // otherwise the browser keeps showing "sharing"
    throw new CaptureError(NO_AUDIO_MESSAGE[source]);
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
