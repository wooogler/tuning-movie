declare module 'ws' {
  import { EventEmitter } from 'events';

  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0;
    static readonly OPEN: 1;
    static readonly CLOSING: 2;
    static readonly CLOSED: 3;

    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;

    readyState: number;

    constructor(address: string);

    send(data: string): void;
    close(code?: number): void;

    on(event: 'open', listener: () => void): this;
    on(event: 'message', listener: (data: RawData) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;

    removeAllListeners(event?: string | symbol): this;
  }

  export default WebSocket;
}
