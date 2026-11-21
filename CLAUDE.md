@AGENTS.md

# APEX TERMINAL — project guide for Claude Code

Browser trading workstation: live Hyperliquid perpetuals data, deterministic
market-structure analysis (swings, BOS, CHoCH, liquidity sweeps, FVGs), a
position-size calculator and a persistent **paper-trading** simulator.
There is **no live order execution** and no API keys anywhere in the app.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3000 (Turbopack) |
| `npm run build` | Production build (also type-checks) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (next core-web-vitals + TS + React Compiler rules) |
| `npm test` | Vitest unit tests (node env, `src/**/*.test.ts`) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `node scripts/ws-probe.mjs` | Dev-only: prints live Hyperliquid WS payload shapes (respects `HTTPS_PROXY`) |

Run `npm run lint && npm test && npm run build` before every commit.

## Stack (versions verified at install time)

Next.js 16.4 App Router (`cacheComponents` + `partialPrefetching` on), React 19.3,
TypeScript strict, Tailwind CSS 4, shadcn/ui-pattern components on `radix-ui`,
Zustand 5, Lightweight Charts 5.3, zod 4, Vitest 5.

Next 16 differs from older versions — read `node_modules/next/dist/docs/` before
using an unfamiliar Next API (see AGENTS.md).

## Architecture

```
src/
  app/                    layout (fonts, metadata) + page → <Terminal/>
  components/
    ui/                   shadcn-style primitives (button, input, tabs, switch, badge, tooltip, label)
    terminal/             workstation panels + headless controllers
      terminal.tsx          layout grid, store rehydration, keyboard (F / Esc)
      market-data-controller.tsx  owns ALL market subscriptions; publishes to market-store
      paper-trading-controller.tsx evaluates SL/TP on every quote update
    chart/                Lightweight Charts host (client-only via next/dynamic ssr:false),
                          StructurePrimitive (canvas primitive for BOS/CHoCH segments + FVG boxes),
                          overlay-builder (StructureResult → primitive data + markers)
  hooks/use-market.ts     selectors/derived hooks (server-corrected clock, structure, quotes)
  lib/
    market/               venue-neutral types, candle merge, clock sync, backoff
      hyperliquid/        adapter (REST candleSnapshot + WS), zod wire schemas, socket, instruments
      provider.ts         the ONLY place a venue adapter is chosen
    structure/            pure market-structure algorithms (no React / no I/O)
    risk/                 position sizing
    paper/                pure paper engine + persisted-state schema/migration
  store/                  zustand: ui-store (persisted), market-store (volatile), paper-store (persisted)
```

### Data flow
1. `MarketDataController` subscribes `bbo` + `activeAssetCtx` for every instrument and
   `candle` for the active symbol/interval through `MarketDataAdapter`.
2. Quotes/contexts are batched into one store write per animation frame.
3. Candle load: subscribe WS first (buffer) → REST snapshot (1500 bars) → merge buffer →
   live merges. A new bar triggers a 3-bar REST reconcile; a gap or reconnect triggers a
   larger backfill. A generation guard (`cancelled` + store key check) drops stale data
   on instrument/timeframe switches.
4. `ChartCanvas` subscribes to the store imperatively (`series.update` / `setData`), so
   ticks never re-render React.
5. Structure is computed once (`useComputeStructure` in the controller) on **closed
   candles only** and published to `market-store.structure`.

### Venue: Hyperliquid public API (no keys)
- REST: `POST https://api.hyperliquid.xyz/info` `{"type":"candleSnapshot",...}` — max 5000 bars,
  unknown coin → HTTP 500 `null`. CORS is `*`, so the browser calls it directly.
- WS: `wss://api.hyperliquid.xyz/ws`, subscriptions `candle`, `bbo`, `activeAssetCtx`;
  app-level `{"method":"ping"}` every 30s. Payload shapes are pinned in
  `lib/market/hyperliquid/schemas.ts` and covered by tests with captured live payloads.
- Adding a venue: implement `MarketDataAdapter` (`lib/market/types.ts`) and switch it in
  `lib/market/provider.ts`. UI code must not import venue modules.

## Non-negotiable constraints

- **Never fabricate prices.** If a provider cannot supply data, show an explicit error
  (see chart error overlay) — no placeholders that look like prices, no demo data.
- **No look-ahead.** Structure algorithms only see closed candles; a pivot exists only at
  `confirmedIndex = index + right`. `structure.test.ts` enforces prefix invariance —
  keep it passing when changing any algorithm.
- **Simulation only.** Paper fills use live top-of-book (long → ask, short → bid; SL/TP
  fill at the observed exit-side price). Every execution surface must say it is simulated.
  Do not add live order routing without an explicit new requirement.
- Stale quotes (> 10s, `QUOTE_MAX_AGE_MS`) must never be used for paper execution.
- Position sizes are **floored** to the instrument's `szDecimals` so loss at stop never
  exceeds the risk budget (property-tested).
- Persisted stores use `skipHydration` and are rehydrated in `Terminal` after mount; never
  read `localStorage` during render. Persisted paper state is zod-validated on load.
- Avoid impure calls (`Date.now()`, `Math.random()`) during render — the React Compiler
  lint rules reject them. Use `useNow`/`useServerNow` or call inside handlers/effects.
- Every visible control must do something real.

## Conventions

- Times: epoch **ms** everywhere in app code; convert to seconds only at the chart boundary.
  UI shows UTC.
- Prices: plain `number`; formatting via `lib/format.ts` with instrument `pxDecimals`.
- Pure logic lives in `lib/` with co-located `*.test.ts`; components stay thin.
- Styling: design tokens in `app/globals.css` (`--bg`, `--panel*`, `--up`, `--down`,
  `--accent`, …) exposed as Tailwind colors (`bg-panel`, `text-up`, …). Numbers use the
  `num` utility (mono, tabular).
- shadcn CLI registry was unreachable in the build sandbox; components were written by
  hand in the shadcn pattern. `components.json` is present so `npx shadcn add` works
  where the registry is reachable.
