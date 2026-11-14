/**
 * A WebSocket that reconnects by itself. The server only removes a pilot from a room when their
 * connection closes, so "leave room" means closing the socket and opening a fresh one; and a
 * dropped connection is retried with a growing delay instead of leaving the pilot stuck.
 */

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

/** 500ms, 1s, 2s, 4s, then 5s for every later attempt. */
export function reconnectDelay(attempt: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt));
}

export type ConnectionEvents = {
  onOpen?: () => void;
  /** `wasLeave` is true when the close was the pilot leaving a room, not a dropped connection. */
  onClose?: (info: { wasLeave: boolean }) => void;
  onMessage?: (data: string) => void;
  onError?: () => void;
};

export class MultiplayerConnection {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private disposed = false;
  private leaving = false;

  constructor(
    private readonly url: string,
    private readonly events: ConnectionEvents = {},
  ) {
    this.connect();
  }

  get isOpen() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  send(message: unknown) {
    if (this.isOpen) this.socket!.send(JSON.stringify(message));
  }

  /** Drops the current room by closing the socket, then connects again straight away. */
  leave() {
    if (this.disposed) return;
    this.leaving = true;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close();
    } else {
      this.leaving = false;
      this.retryNow();
    }
  }

  dispose() {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private connect() {
    if (this.disposed) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.events.onOpen?.();
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.events.onMessage?.(String(event.data));
    };
    socket.onerror = () => {
      if (this.socket === socket) this.events.onError?.();
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      const wasLeave = this.leaving;
      this.leaving = false;
      this.socket = null;
      this.events.onClose?.({ wasLeave });
      if (this.disposed) return;
      if (wasLeave) {
        this.retryNow();
      } else {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.connect();
        }, reconnectDelay(this.attempt++));
      }
    };
  }

  private retryNow() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.connect();
  }
}
