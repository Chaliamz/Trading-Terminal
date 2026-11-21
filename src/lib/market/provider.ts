import { HyperliquidAdapter } from "./hyperliquid/adapter";
import type { MarketDataAdapter } from "./types";

/**
 * Single point where the active venue adapter is chosen. To add a venue,
 * implement MarketDataAdapter and return it here — no UI code changes needed.
 */
let adapter: HyperliquidAdapter | null = null;
let invalidListener: ((channel: string, issue: string) => void) | null = null;

export function getMarketAdapter(): MarketDataAdapter {
  if (typeof window === "undefined") {
    throw new Error("Market data adapter is client-only");
  }
  if (!adapter) {
    adapter = new HyperliquidAdapter({
      onInvalidMessage: (channel, issue) => invalidListener?.(channel, issue),
    });
  }
  return adapter;
}

export function setInvalidMessageListener(fn: ((channel: string, issue: string) => void) | null) {
  invalidListener = fn;
}
