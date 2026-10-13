import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The developer log: a full record of one call, written only when the user switches on
// "Режим разработчика" on the setup screen. It is the one place where call text is written
// to disk, so it lives in an ignored folder next to the code and is opt-in for every call.
//
// One line per entry, as JSON: when it happened, what kind of entry it is, and the data.

export interface DevLog {
  /** Where the log is written (shown to the user). */
  readonly path: string;
  write(kind: string, data?: unknown): void;
}

export type DevLogFactory = () => DevLog | undefined;

/** Creates a factory that opens a new file `<dir>/<time>.jsonl` for every call. */
export function fileDevLogs(dir: string, now: () => Date = () => new Date()): DevLogFactory {
  return () => {
    try {
      mkdirSync(dir, { recursive: true });
      const started = now();
      const path = join(dir, `${started.toISOString().replace(/[:.]/g, '-')}.jsonl`);
      return {
        path,
        write(kind, data) {
          const entry = { t: now().toISOString(), ms: now().getTime() - started.getTime(), kind, data };
          try {
            appendFileSync(path, `${JSON.stringify(entry)}\n`);
          } catch {
            // A full disk must not break the call; the log just stops.
          }
        },
      };
    } catch {
      return undefined; // the folder cannot be created: the call goes on without a log
    }
  };
}
