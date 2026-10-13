// The contract between the browser and the server.
//
// One browser WebSocket (/ws) = one call session. Text messages are JSON objects.
// Every message has a `type` field: that makes each union below a "discriminated union",
// so after `switch (message.type)` TypeScript knows exactly which other fields exist.
// Audio travels as raw binary frames and is not described here.

/** Language of the call. `multi` = automatic German + English detection. */
export type Language = 'de' | 'en' | 'multi';

/** Language the other person's sentences are translated into. */
export type TargetLanguage = 'ru' | 'uk' | 'de' | 'en';

/** Which kind of reply hint was asked for. */
export type HintMode = 'short' | 'detailed';

/** Identifier of an LLM provider. */
export type ProviderId = 'gemini' | 'anthropic';

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

/** First message after the socket opens: the session settings chosen on the setup screen. */
export interface StartMessage {
  type: 'start';
  language: Language;
  /** Sentences are translated into this language; sentences already in it are left alone. */
  targetLanguage: TargetLanguage;
  provider: ProviderId;
  /** Model used for translating sentences (fast one). */
  translationModel: string;
  /** Model used for reply hints (strong one). */
  hintModel: string;
  /** Optional free text: who is calling and why. Sent to the LLM, never stored. */
  callContext: string;
  /** Optional "my data" text (name, profession...). Used for hints only, never for translation. */
  profile: string;
}

/** The user pressed "Коротко" or "Подробно" on a sentence card. */
export interface HintRequestMessage {
  type: 'hint';
  /** Id of the sentence the hint is for. */
  id: number;
  mode: HintMode;
}

/** The user pressed "повторить" after a failed translation. */
export interface RetranslateMessage {
  type: 'retranslate';
  id: number;
}

/** The user pressed "Стоп". */
export interface StopMessage {
  type: 'stop';
}

export type ClientMessage = StartMessage | HintRequestMessage | RetranslateMessage | StopMessage;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

/** What the session is doing right now (shown in the header indicator). */
export type SessionState = 'connecting' | 'listening' | 'speaking' | 'reconnecting' | 'stopped';

export interface StatusMessage {
  type: 'status';
  state: SessionState;
}

/** Content of the "live" card at the bottom: the phrase that is not finished yet. */
export interface InterimMessage {
  type: 'interim';
  /** Part already confirmed by the speech recognizer. */
  finalText: string;
  /** Part that may still change (shown in grey). */
  interimText: string;
}

/** A finished sentence. Its `id` ties together all later translation and hint messages. */
export interface SentenceMessage {
  type: 'sentence';
  id: number;
  text: string;
  language?: string;
}

/**
 * A translation (re)starts: the card's translation text is emptied. Sent before a retry or a
 * requested re-translation, so pieces of two attempts are never glued together.
 */
export interface TranslationStartMessage {
  type: 'translation_start';
  id: number;
}

/** A piece of the translation, streamed as the LLM produces it. */
export interface TranslationDeltaMessage {
  type: 'translation_delta';
  id: number;
  delta: string;
}

export interface TranslationDoneMessage {
  type: 'translation_done';
  id: number;
}

export interface TranslationErrorMessage {
  type: 'translation_error';
  id: number;
}

/** A new hint starts: the client clears the hint block of that card. */
export interface HintStartMessage {
  type: 'hint_start';
  id: number;
  mode: HintMode;
}

export interface HintDeltaMessage {
  type: 'hint_delta';
  id: number;
  delta: string;
}

export interface HintDoneMessage {
  type: 'hint_done';
  id: number;
}

export interface HintErrorMessage {
  type: 'hint_error';
  id: number;
}

/** After the speech recognizer reconnects it needs a fresh webm header: restart MediaRecorder. */
export interface RestartRecorderMessage {
  type: 'restart_recorder';
}

/** A short remark that goes away by itself (for example "provider rate limit"), not an error. Russian. */
export interface NoticeMessage {
  type: 'notice';
  message: string;
}

/** A problem to show to the user. `message` is Russian and human-readable. */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | StatusMessage
  | InterimMessage
  | SentenceMessage
  | TranslationStartMessage
  | TranslationDeltaMessage
  | TranslationDoneMessage
  | TranslationErrorMessage
  | HintStartMessage
  | HintDeltaMessage
  | HintDoneMessage
  | HintErrorMessage
  | RestartRecorderMessage
  | NoticeMessage
  | ErrorMessage;

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Chat models the provider offers right now. */
  models: string[];
  /** Preselected model for translating sentences (fast). Always one of `models`. */
  defaultTranslationModel: string;
  /** Preselected model for reply hints (strong). Always one of `models`. */
  defaultHintModel: string;
}

/** Public configuration. Never contains API keys. */
export interface ApiConfig {
  defaultProvider: ProviderId;
  providers: ProviderInfo[];
}
