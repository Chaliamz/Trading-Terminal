import type { Instrument } from "../types";

/**
 * Hyperliquid perpetuals supported by the terminal.
 * szDecimals / maxLeverage verified against `POST /info {"type":"meta"}` on 2026-11-21.
 */
export const HYPERLIQUID_INSTRUMENTS: readonly Instrument[] = [
  { symbol: "BTC", display: "BTC-PERP", base: "BTC", quote: "USD", pxDecimals: 1, szDecimals: 5, maxLeverage: 40 },
  { symbol: "ETH", display: "ETH-PERP", base: "ETH", quote: "USD", pxDecimals: 2, szDecimals: 4, maxLeverage: 25 },
  { symbol: "SOL", display: "SOL-PERP", base: "SOL", quote: "USD", pxDecimals: 3, szDecimals: 2, maxLeverage: 20 },
];
