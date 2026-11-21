import { backoffDelay } from "../backoff";
import type { FeedStatus, StreamStatusEvent } from "../types";
import { wsEnvelopeSchema } from "./schemas";

type Listener = (data: unknown, receivedAt: number) => void;

interface SubEntry {
  /** Subscription object sent to the venue. */
  subscription: Record<string, string>;
  listeners: Set<Listener>;
}

export interface SocketOptions {
  url: string;
  /** Send an application-level ping this often (venue drops idle connections after ~60s). */
  pingIntervalMs?: number;
  /** No inbound message for this long → status "stale". */
  staleAfterMs?: number;
  /** No inbound message for this long → force reconnect. */
  deadAfterMs?: number;
  /** Injected for tests. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Single multiplexed WebSocket with ref-counted subscriptions.
 *  - Connects lazily on the first subscription.
 *  - Resubscribes everything after a reconnect; `connectionId` increments so
 *    consumers can backfill gaps over REST.
 *  - Reconnects with jittered exponential backoff; immediately when the
 *    browser reports it is back online.
 *  - Watchdog flags a silent feed as stale, then tears it down.
 */
export class MultiplexSocket {
  private ws: WebSocket | null = null;
  private subs = new Map<string, SubEntry>();
  private statusListeners = new Set<(e: StreamStatusEvent) => void>();
  private messageListeners = new Set<(channel: string, data: unknown, at: number) => void>();
  private status: FeedStatus = "idle";
  private connectionId = 0;
  private attempt = 0;
  private lastMessageAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private readonly opts: Required<Omit<SocketOptions, "WebSocketImpl">> & { WebSocketImpl?: typeof WebSocket };

  constructor(opts: SocketOptions) {
    this.opts = {
      pingIntervalMs: 30_000,
      staleAfterMs: 15_000,
      deadAfterMs: 45_000,
      ...opts,
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline);
    }
  }

  // ---------- public API ----------

  subscribe(routeKey: string, subscription: Record<string, string>, listener: Listener): () => void {
    let entry = this.subs.get(routeKey);
    if (!entry) {
      entry = { subscription, listeners: new Set() };
      this.subs.set(routeKey, entry);
      this.send({ method: "subscribe", subscription });
    }
    entry.listeners.add(listener);
    this.ensureConnected();

    return () => {
      const e = this.subs.get(routeKey);
      if (!e) return;
      e.listeners.delete(listener);
      if (e.listeners.size === 0) {
        this.subs.delete(routeKey);
        this.send({ method: "unsubscribe", subscription: e.subscription });
      }
    };
  }

  onStatus(cb: (e: StreamStatusEvent) => void): () => void {
    this.statusListeners.add(cb);
    cb({ status: this.status, connectionId: this.connectionId });
    return () => this.statusListeners.delete(cb);
  }

  onMessage(cb: (channel: string, data: unknown, at: number) => void): () => void {
    this.messageListeners.add(cb);
    return () => this.messageListeners.delete(cb);
  }

  reconnect(): void {
    this.attempt = 0;
    this.teardown();
    this.clearReconnect();
    this.open();
  }

  dispose(): void {
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("online", this.handleOnline);
    this.clearReconnect();
    this.teardown();
    this.subs.clear();
  }

  // ---------- internals ----------

  private ensureConnected() {
    if (this.disposed || this.ws || this.reconnectTimer) return;
    this.open();
  }

  private open() {
    if (this.disposed) return;
    const Impl = this.opts.WebSocketImpl ?? (typeof WebSocket !== "undefined" ? WebSocket : undefined);
    if (!Impl) {
      this.setStatus("error", "WebSocket is not available in this environment");
      return;
    }
    this.setStatus(this.connectionId === 0 ? "connecting" : "reconnecting");
    let ws: WebSocket;
    try {
      ws = new Impl(this.opts.url);
    } catch (err) {
      this.setStatus("error", `WebSocket construction failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.connectionId++;
      this.lastMessageAt = Date.now();
      for (const e of this.subs.values()) this.send({ method: "subscribe", subscription: e.subscription });
      this.startTimers();
      this.setStatus("live");
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      const at = Date.now();
      this.lastMessageAt = at;
      if (this.status === "stale") this.setStatus("live");
      let json: unknown;
      try {
        json = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        this.emitMessage("__invalid", ev.data, at);
        return;
      }
      const env = wsEnvelopeSchema.safeParse(json);
      if (!env.success) {
        this.emitMessage("__invalid", json, at);
        return;
      }
      const { channel, data } = env.data;
      this.emitMessage(channel, data, at);
      if (channel === "error") {
        this.setStatus(this.status, `Venue error: ${String(data).slice(0, 200)}`);
        return;
      }
      const key = routeKeyFor(channel, data);
      if (!key) return;
      const entry = this.subs.get(key);
      if (!entry) return;
      for (const l of entry.listeners) l(data, at);
    };

    ws.onerror = () => {
      // onclose always follows; status is handled there.
    };

    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopTimers();
      if (this.disposed) return;
      const reason = ev.reason ? `: ${ev.reason}` : "";
      this.setStatus("reconnecting", `Connection closed (code ${ev.code}${reason})`);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer) return;
    const delay = backoffDelay(this.attempt++);
    this.setStatus("reconnecting", `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.attempt})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private teardown() {
    this.stopTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    }
  }

  private startTimers() {
    this.stopTimers();
    this.pingTimer = setInterval(() => this.send({ method: "ping" }), this.opts.pingIntervalMs);
    this.watchdogTimer = setInterval(() => {
      const silence = Date.now() - this.lastMessageAt;
      if (silence > this.opts.deadAfterMs) {
        this.teardown();
        this.setStatus("reconnecting", `No data for ${Math.round(silence / 1000)}s — reconnecting`);
        this.scheduleReconnect();
      } else if (silence > this.opts.staleAfterMs && this.status === "live") {
        this.setStatus("stale", `No data for ${Math.round(silence / 1000)}s`);
      }
    }, 1000);
  }

  private stopTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.pingTimer = this.watchdogTimer = null;
  }

  private send(msg: unknown) {
    if (this.ws && this.ws.readyState === 1 /* OPEN */) this.ws.send(JSON.stringify(msg));
  }

  private setStatus(status: FeedStatus, detail?: string) {
    this.status = status;
    const e: StreamStatusEvent = { status, detail, connectionId: this.connectionId };
    for (const l of this.statusListeners) l(e);
  }

  private emitMessage(channel: string, data: unknown, at: number) {
    for (const l of this.messageListeners) l(channel, data, at);
  }

  private handleOnline = () => {
    if (this.disposed) return;
    if (!this.ws || this.status !== "live") this.reconnect();
  };
}

/** Maps an inbound message to the route key its subscription was registered under. */
export function routeKeyFor(channel: string, data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  switch (channel) {
    case "candle":
      return typeof d.s === "string" && typeof d.i === "string" ? `candle:${d.s}:${d.i}` : null;
    case "bbo":
      return typeof d.coin === "string" ? `bbo:${d.coin}` : null;
    case "activeAssetCtx":
      return typeof d.coin === "string" ? `ctx:${d.coin}` : null;
    default:
      return null;
  }
}
