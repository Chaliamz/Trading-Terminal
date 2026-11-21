# APEX TERMINAL

A desktop-first trading workstation that runs in the browser. It streams live
**Hyperliquid** perpetuals data (BTC, ETH, SOL) into a Bloomberg-style terminal with:

- **Live candlestick chart:** 5M / 15M / 1H / 4H / 1D, built on TradingView Lightweight Charts. History loads over REST and live candles stream over WebSocket.
- **Market-structure overlays:** swing highs/lows (HH/HL/LH/LL), BOS, CHoCH, liquidity sweeps and fair value gaps. They are computed deterministically on closed candles only, each can be toggled on or off, and the pivot and break rules are configurable.
- **Risk calculator:** sizes a position from equity, entry, stop and risk % (default 1%). It shows position size, money at risk, take-profit, gross/net R:R and effective leverage, and can send the result to the order ticket.
- **Paper trading:** a simulated $10,000 account. Orders fill against the live top of book, stop-loss/take-profit trigger automatically, closed trades go to a journal with R-multiples, notes and CSV export, and state survives page reloads (stored in localStorage).

> **Simulation only.** The app never sends orders to any exchange and needs no API keys.
> All market data comes from Hyperliquid's public endpoints.

## Run locally

Requirements: Node.js ≥ 20.9 (developed on Node 22) and npm, with internet access to
`api.hyperliquid.xyz`.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

Production build:

```bash
npm run build
```

```bash
npm start
```

Quality gates:

```bash
npm run lint
```

```bash
npm test
```

## Using it

| Action | How |
| --- | --- |
| Switch market | Top bar tabs or watchlist rows |
| Timeframe | `5M 15M 1H 4H 1D` segmented control |
| Expand chart | Expand button or **F**; **Esc** restores |
| Toggle overlays | Quick toggles above the chart, or **Structure** tab (also pivot left/right bars, close vs. wick breaks, minimum FVG size) |
| Size a trade | **Risk** tab: fill entry from ask/bid, stop from the last swing low/high or by hand, then **Send to order ticket** |
| Paper trade | **Order** tab: buy/sell, optional SL/TP, submit. Edit SL/TP inline in **Positions**; close manually or let SL/TP trigger |
| Journal | **Journal** tab: notes per trade, win rate, average R, CSV export |
| Simulation settings | Gear icon in the account strip (fee rate, leverage cap); **Reset** restores $10,000 |
| Feed control | Status bar shows LIVE / STALE / RECONNECTING, last-tick age and clock offset; **Reconnect** forces a new socket |

## Execution model (paper)

- Market orders: longs fill at the best ask, shorts at the best bid. Book depth is not modelled.
- SL/TP are checked on every best-bid/offer update against the side you would exit on.
  They fill at the observed price, so a gap through your stop costs slippage.
- A taker fee is charged on entry and exit. The default is 0.045%, an *assumed* Hyperliquid base tier; adjust it in settings.
- No funding payments and no liquidation engine. Gross exposure is capped at
  `leverageCap × equity` (default 10×).
- Quotes older than 10 seconds are never used for fills, so orders are disabled while the feed is stale.

## Market-structure definitions

- **Swing (fractal):** high[i] is strictly greater than the `left` bars before it, and greater than or equal to the `right` bars after it. Lows mirror this. A swing is confirmed only after `right` more bars have closed.
- **BOS / CHoCH:** a close (or a wick, if that mode is selected) beyond the latest confirmed, unbroken swing. If the break is in the direction of the trend, or no trend exists yet, it is a BOS. If it goes against the trend, it is a CHoCH and the trend flips.
- **Liquidity sweep:** a wick beyond a confirmed swing level (up to 8 recent levels per side) followed by a close back inside it. Each level can be swept once.
- **FVG:** a three-candle gap: `low[i] > high[i-2]` (bullish) or `high[i] < low[i-2]` (bearish). The gap is tracked as open, partially filled (with fill %) or fully filled, based only on later candles.

`src/lib/structure/structure.test.ts` checks that every event known after *k* candles is
identical whether computed on the first *k* candles or the full history. That is the
regression guard against look-ahead bias.

See `CLAUDE.md` for architecture and engineering constraints.
