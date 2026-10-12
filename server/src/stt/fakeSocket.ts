import { EventEmitter } from 'node:events';
import type { SocketFactory, SocketLike } from './types';

// A stand-in for the WebSocket to the speech service, used only by tests.
// It records what was sent and lets a test act as the service (open, send messages, drop).
export class FakeSocket extends EventEmitter implements SocketLike {
  readyState = 0; // 0 = connecting, 1 = open, 3 = closed (same numbers as the real WebSocket)
  sent: Array<Uint8Array | string> = [];
  terminateCalls = 0;

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {
    super();
  }

  send(data: Uint8Array | string): void {
    this.sent.push(data);
  }

  terminate(): void {
    this.terminateCalls++;
    this.readyState = 3;
    this.emit('close', 1006);
  }

  // --- the test plays the service ---
  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  receive(message: unknown): void {
    this.emit('message', Buffer.from(typeof message === 'string' ? message : JSON.stringify(message)), false);
  }

  /** The service (or the network) closes the connection. */
  drop(code = 1006): void {
    this.readyState = 3;
    this.emit('close', code);
  }

  reject(statusCode: number): void {
    this.emit('unexpected-response', {}, { statusCode });
  }

  get text(): string[] {
    return this.sent.filter((d): d is string => typeof d === 'string');
  }

  get audio(): Uint8Array[] {
    return this.sent.filter((d): d is Uint8Array => typeof d !== 'string');
  }
}

export function fakeSocketFactory() {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = (url, headers) => {
    const socket = new FakeSocket(url, headers);
    sockets.push(socket);
    return socket;
  };
  return { factory, sockets };
}
