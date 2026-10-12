import { describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@ai-prompter/shared/protocol';
import { CaptureError, type Capture } from './audioCapture';
import { startCall, type CallDeps } from './callSession';
import type { CallAction } from './callReducer';
import type { Connection, ConnectionOptions } from './connection';
import type { Settings } from './settings';

const settings: Settings = {
  audioSource: 'tab',
  language: 'de',
  provider: 'gemini',
  translationModel: 'fast',
  hintModel: 'strong',
  callContext: 'Arzttermin',
  profile: 'Name: Test',
};

// Fakes for the two things the orchestrator connects.
function fakeCapture() {
  const capture = {
    onChunk: undefined as ((chunk: Uint8Array) => void) | undefined,
    starts: 0,
    restarts: 0,
    stops: 0,
    start: vi.fn((cb: (chunk: Uint8Array) => void) => {
      capture.starts++;
      capture.onChunk = cb;
    }),
    restart: vi.fn(() => void capture.restarts++),
    stop: vi.fn(() => void capture.stops++),
  };
  return capture satisfies Capture & Record<string, unknown>;
}

function fakeConnection() {
  const connection = {
    audio: [] as Uint8Array[],
    hints: [] as Array<[number, string]>,
    retranslations: [] as number[],
    stopCalls: 0,
    sendAudio: vi.fn((chunk: Uint8Array) => void connection.audio.push(chunk)),
    requestHint: vi.fn((id: number, mode: string) => void connection.hints.push([id, mode])),
    retranslate: vi.fn((id: number) => void connection.retranslations.push(id)),
    stop: vi.fn(async () => void connection.stopCalls++),
  };
  return connection satisfies Connection & Record<string, unknown>;
}

function setup(overrides: Partial<CallDeps> = {}) {
  const capture = fakeCapture();
  const connection = fakeConnection();
  const actions: CallAction[] = [];
  const notices: string[] = [];
  let captureOptions: { onEnded(): void } | undefined;
  let connectionOptions: ConnectionOptions | undefined;
  const deps: CallDeps = {
    dispatch: (action) => void actions.push(action),
    notify: (text) => void notices.push(text),
    createCapture: vi.fn(async (_source, options) => {
      captureOptions = options;
      return capture;
    }),
    createConnection: vi.fn((options) => {
      connectionOptions = options;
      return connection;
    }),
    url: 'ws://test/ws',
    ...overrides,
  };
  return {
    deps,
    capture,
    connection,
    actions,
    notices,
    get captureOptions() {
      return captureOptions!;
    },
    get server() {
      return connectionOptions!;
    },
  };
}

const status = (state: 'listening' | 'speaking' = 'listening'): ServerMessage => ({ type: 'status', state });

describe('starting', () => {
  it('asks for audio of the chosen source first', async () => {
    const kit = setup();

    await startCall({ ...settings, audioSource: 'mic' }, kit.deps);

    expect(kit.deps.createCapture).toHaveBeenCalledWith('mic', expect.any(Object));
  });

  it('passes a capture error on and opens no connection', async () => {
    const kit = setup({
      createCapture: vi.fn(async () => {
        throw new CaptureError('Звук не захвачен.');
      }),
    });

    await expect(startCall(settings, kit.deps)).rejects.toThrow('Звук не захвачен.');

    expect(kit.deps.createConnection).not.toHaveBeenCalled();
    expect(kit.actions).toEqual([]);
  });

  it('opens the connection with the chosen settings and shows "connecting"', async () => {
    const kit = setup();

    await startCall(settings, kit.deps);

    expect(kit.server.url).toBe('ws://test/ws');
    expect(kit.server.start).toEqual({
      language: 'de',
      provider: 'gemini',
      translationModel: 'fast',
      hintModel: 'strong',
      callContext: 'Arzttermin',
      profile: 'Name: Test',
    });
    expect(kit.actions).toEqual([{ type: 'reset' }, { type: 'status', state: 'connecting' }]);
  });

  it('does not record before the server has accepted the session', async () => {
    const kit = setup();

    await startCall(settings, kit.deps);

    expect(kit.capture.starts).toBe(0);
  });
});

describe('a running call', () => {
  it('starts recording when the session is accepted and sends the chunks on', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);

    kit.server.onSessionReady(false);
    kit.capture.onChunk!(new Uint8Array([1]));
    kit.capture.onChunk!(new Uint8Array([2]));

    expect(kit.capture.starts).toBe(1);
    expect(kit.connection.audio).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });

  it('passes server messages to the screen state', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);

    kit.server.onMessage(status('speaking'));
    kit.server.onMessage({ type: 'sentence', id: 1, text: 'Hallo.' });

    expect(kit.actions.slice(-2)).toEqual([status('speaking'), { type: 'sentence', id: 1, text: 'Hallo.' }]);
  });

  it('restarts the recorder when the server asks, without bothering the screen state', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);
    kit.server.onSessionReady(false);
    const before = kit.actions.length;

    kit.server.onMessage({ type: 'restart_recorder' });

    expect(kit.capture.restarts).toBe(1);
    expect(kit.actions).toHaveLength(before);
  });

  it('shows "reconnecting" during an outage and keeps recording', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);
    kit.server.onSessionReady(false);

    kit.server.onReconnecting();

    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'reconnecting' });
    expect(kit.capture.stops).toBe(0);
  });

  it('marks a new session and restarts the recorder after a reconnect', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);
    kit.server.onSessionReady(false);

    kit.server.onSessionReady(true);

    expect(kit.actions.at(-1)).toEqual({ type: 'session_restarted' });
    expect(kit.capture.restarts).toBe(1);
    expect(kit.capture.starts).toBe(1); // not started a second time
  });

  it('passes hint and retranslate requests to the connection', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);

    call.requestHint(3, 'detailed');
    call.retranslate(4);

    expect(kit.connection.hints).toEqual([[3, 'detailed']]);
    expect(kit.connection.retranslations).toEqual([4]);
  });

  it('tells the user briefly when a card is no longer available', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);

    kit.server.onCardUnavailable(2);

    expect(kit.notices).toHaveLength(1);
    expect(kit.notices[0]).toMatch(/недоступн/);
  });
});

describe('notices from the server', () => {
  it('are shown as a short note, not put into the screen state', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);
    const before = kit.actions.length;

    kit.server.onMessage({ type: 'notice', message: 'Лимит запросов провайдера' });

    expect(kit.notices).toEqual(['Лимит запросов провайдера']);
    expect(kit.actions).toHaveLength(before);
  });
});

describe('ending', () => {
  it('on stop: releases the capture, stops the connection, shows "stopped"', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);
    kit.server.onSessionReady(false);

    await call.stop();

    expect(kit.capture.stops).toBe(1);
    expect(kit.connection.stopCalls).toBe(1);
    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'stopped' });
  });

  it('stops capturing before waiting for the server', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);
    let release!: () => void;
    kit.connection.stop = vi.fn(() => new Promise<void>((resolve) => (release = resolve))) as never;

    const stopping = call.stop();

    expect(kit.capture.stops).toBe(1); // the sharing indicator goes away at once
    release();
    await stopping;
  });

  it('can be stopped twice', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);

    await call.stop();
    await call.stop();

    expect(kit.connection.stopCalls).toBe(1);
    expect(kit.capture.stops).toBe(1);
  });

  it('stops like the button when the user ends screen sharing in the browser', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);

    kit.captureOptions.onEnded();
    await Promise.resolve();

    expect(kit.capture.stops).toBe(1);
    expect(kit.connection.stop).toHaveBeenCalled();
  });

  it('releases the capture when the server ended the session, keeping its error visible', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);
    kit.server.onMessage({ type: 'error', message: 'Ключ отклонён' });

    kit.server.onSessionEnded();

    expect(kit.capture.stops).toBe(1);
    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'stopped' });
    expect(kit.actions).toContainEqual({ type: 'error', message: 'Ключ отклонён' });
  });

  it('releases the capture and explains when reconnecting failed for good', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);

    kit.server.onGaveUp();

    expect(kit.capture.stops).toBe(1);
    expect(kit.actions).toContainEqual({ type: 'error', message: expect.stringMatching(/Нет связи с сервером/) });
    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'stopped' });
  });

  it('does nothing more after the end', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);
    await call.stop();
    const count = kit.actions.length;

    kit.server.onGaveUp();
    kit.captureOptions.onEnded();

    expect(kit.capture.stops).toBe(1);
    expect(kit.actions).toHaveLength(count);
  });
});

describe('review fixes', () => {
  it('releases the capture when opening the connection fails', async () => {
    const kit = setup({
      createConnection: vi.fn(() => {
        throw new Error('bad url');
      }),
    });

    await expect(startCall(settings, kit.deps)).rejects.toThrow('bad url');

    expect(kit.capture.stops).toBe(1);
  });

  it('ends the call with an explanation when the recorder cannot start', async () => {
    const kit = setup();
    kit.capture.start.mockImplementation(() => {
      throw new CaptureError('Этот браузер не умеет записывать звук.');
    });
    await startCall(settings, kit.deps);

    kit.server.onSessionReady(false);

    expect(kit.actions).toContainEqual({ type: 'error', message: 'Этот браузер не умеет записывать звук.' });
    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'stopped' });
    expect(kit.capture.stops).toBe(1);
    expect(kit.connection.stop).toHaveBeenCalled();
  });

  it('ends the call with an explanation when a recorder restart fails', async () => {
    const kit = setup();
    await startCall(settings, kit.deps);
    kit.server.onSessionReady(false);
    kit.capture.restart.mockImplementation(() => {
      throw new Error('recorder broke');
    });

    kit.server.onMessage({ type: 'restart_recorder' });

    expect(kit.actions).toContainEqual({ type: 'error', message: expect.stringMatching(/запис/i) });
    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'stopped' });
  });

  it('still reaches "stopped" when stopping the connection fails', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);
    kit.connection.stop = vi.fn(async () => {
      throw new Error('socket error');
    }) as never;

    await expect(call.stop()).resolves.toBeUndefined();

    expect(kit.actions.at(-1)).toEqual({ type: 'status', state: 'stopped' });
  });

  it('shows no notices after the call ended', async () => {
    const kit = setup();
    const call = await startCall(settings, kit.deps);
    await call.stop();

    kit.server.onCardUnavailable(1);

    expect(kit.notices).toEqual([]);
  });
});
