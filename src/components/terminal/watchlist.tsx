"use client";

import { HYPERLIQUID_INSTRUMENTS } from "@/lib/market/hyperliquid/instruments";
import { fmtCompactUsd, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMarketStore } from "@/store/market-store";
import { useUiStore } from "@/store/ui-store";
import { ActivityLog } from "./activity-log";

export function Watchlist() {
  const activeSymbol = useUiStore((s) => s.activeSymbol);
  const setActiveSymbol = useUiStore((s) => s.setActiveSymbol);
  const contexts = useMarketStore((s) => s.contexts);
  const quotes = useMarketStore((s) => s.quotes);
  const feedStatus = useMarketStore((s) => s.feedStatus);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="panel-title">Watchlist</span>
        <span className="text-[10px] text-fg-mute">Perps · USD</span>
      </div>
      <div className="grid grid-cols-[1fr_auto] border-b border-line px-3 py-1 text-[10px] text-fg-mute uppercase">
        <span>Market</span>
        <span className="text-right">Mark / 24h</span>
      </div>
      <ul className="shrink-0">
        {HYPERLIQUID_INSTRUMENTS.map((inst) => {
          const ctx = contexts[inst.symbol];
          const q = quotes[inst.symbol];
          const chg = ctx ? ctx.markPx / ctx.prevDayPx - 1 : null;
          const active = inst.symbol === activeSymbol;
          const spreadBps = q ? ((q.ask - q.bid) / ((q.ask + q.bid) / 2)) * 10_000 : null;
          return (
            <li key={inst.symbol}>
              <button
                type="button"
                onClick={() => setActiveSymbol(inst.symbol)}
                aria-pressed={active}
                className={cn(
                  "group relative grid w-full cursor-pointer grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 border-b border-line/60 px-3 py-2 text-left transition-colors",
                  active ? "bg-accent-dim/60" : "hover:bg-panel-2",
                )}
              >
                {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
                <span className="text-[12px] font-semibold text-fg">
                  {inst.base}
                  <span className="ml-1 text-[10px] font-normal text-fg-mute">PERP</span>
                </span>
                <span className="num text-right text-[12px] text-fg">
                  {ctx ? fmtPrice(ctx.markPx, inst.pxDecimals) : <Pending status={feedStatus} />}
                </span>
                <span className="num text-[10px] text-fg-mute">
                  Vol {fmtCompactUsd(ctx?.dayNotionalVolume)}
                  {spreadBps != null && <span className="ml-1.5">· {spreadBps.toFixed(1)}bp</span>}
                </span>
                <span
                  className={cn(
                    "num text-right text-[11px]",
                    chg == null ? "text-fg-mute" : chg >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {fmtPct(chg)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-3 py-2 text-[10px] leading-relaxed text-fg-mute">
        Live mark prices from Hyperliquid&apos;s public WebSocket. 24h change vs. venue previous-day price.
      </p>
      <ActivityLog />
    </div>
  );
}

function Pending({ status }: { status: string }) {
  return <span className="text-[10px] text-fg-mute">{status === "error" ? "no data" : "loading…"}</span>;
}
