// One error type for everything that can go wrong when talking to an LLM service,
// so the rest of the server never needs to know about the two SDKs' own error classes.

export type LlmErrorKind = 'rate_limit' | 'auth' | 'timeout' | 'other';

// The one class in this codebase: extending `Error` has no function-style equivalent.
export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LlmError';
  }
}

function kindForStatus(status: number | undefined): LlmErrorKind {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  return 'other';
}

/**
 * Turns whatever an SDK threw into an LlmError. Both SDKs put the HTTP status in `status`.
 * The message is built here from the provider name and status only: the SDK's own text
 * can contain request details and is kept out (it stays reachable through `cause`).
 */
export function toLlmError(provider: string, error: unknown): LlmError {
  if (error instanceof LlmError) return error;

  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
  const name = (error as { name?: unknown })?.name;
  const isTimeoutByName = typeof name === 'string' && /timeout/i.test(name);

  const kind = isTimeoutByName ? 'timeout' : kindForStatus(status);
  const detail = status !== undefined ? `HTTP ${status}` : isTimeoutByName ? 'timeout' : 'unknown error';
  return new LlmError(kind, `${provider} request failed: ${detail}`, status, { cause: error });
}

/** True for the errors thrown when a request is cancelled on purpose (not a real failure). */
export function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'APIUserAbortError';
}
