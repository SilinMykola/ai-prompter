import { describe, expect, it } from 'vitest';
import { LlmError, isAbortError, toLlmError } from './errors';

// SDK errors differ in class, but both carry the HTTP status as `status`.
const http = (status: number) => Object.assign(new Error('boom'), { status });

describe('toLlmError', () => {
  it.each([
    [429, 'rate_limit'],
    [401, 'auth'],
    [403, 'auth'],
    [408, 'timeout'],
    [504, 'timeout'],
    [500, 'other'],
    [400, 'other'],
  ])('maps HTTP %i to %s', (status, kind) => {
    const error = toLlmError('gemini', http(status));

    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
  });

  it('recognises timeout errors by name', () => {
    const timeout = Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' });

    expect(toLlmError('anthropic', timeout).kind).toBe('timeout');
  });

  it('maps unknown values to "other"', () => {
    expect(toLlmError('gemini', 'just a string').kind).toBe('other');
    expect(toLlmError('gemini', undefined).kind).toBe('other');
  });

  it('returns an LlmError unchanged', () => {
    const original = new LlmError('rate_limit', 'already mapped');

    expect(toLlmError('gemini', original)).toBe(original);
  });

  it('keeps the provider and status in the message but not the SDK text', () => {
    const error = toLlmError('gemini', Object.assign(new Error('secret-key-abc in url'), { status: 500 }));

    expect(error.message).toContain('gemini');
    expect(error.message).toContain('500');
    expect(error.message).not.toContain('secret-key-abc');
  });
});

describe('isAbortError', () => {
  it('recognises the usual abort errors', () => {
    expect(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(Object.assign(new Error('x'), { name: 'APIUserAbortError' }))).toBe(true);
  });

  it('does not treat other errors as aborts', () => {
    expect(isAbortError(http(500))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
