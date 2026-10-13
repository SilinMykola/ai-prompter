import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileDevLogs } from './devLog';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'devlog-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('file developer log', () => {
  it('writes one JSON line per entry with the time and the data', () => {
    let clock = 1_000_000;
    const open = fileDevLogs(join(tempDir(), 'logs'), () => new Date((clock += 250)));
    const log = open()!;

    log.write('sentence', { id: 1, text: 'Guten Tag.' });
    log.write('event', 'translation_failed kind=timeout');

    const lines = readFileSync(log.path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ kind: 'sentence', data: { id: 1, text: 'Guten Tag.' } });
    expect(lines[1]).toMatchObject({ kind: 'event', data: 'translation_failed kind=timeout' });
    expect(lines[1].ms).toBeGreaterThan(lines[0].ms);
  });

  it('gives every call its own file', () => {
    let clock = 0;
    const open = fileDevLogs(tempDir(), () => new Date((clock += 1000)));

    expect(open()!.path).not.toBe(open()!.path);
  });

  it('returns nothing when the folder cannot be created', () => {
    const open = fileDevLogs('/dev/null/cannot/exist');

    expect(open()).toBeUndefined();
  });
});
