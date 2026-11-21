"use client";

import { fmtCompactUsd, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActiveInstrument } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import { Stat } from "./fields";

export function MarketInfo() {
  const inst = useActiveInstrument();
  const ctx = useMarketStore((s) => s.contexts[inst.symbol]);
  const q = useMarketStore((s) => s.quotes[inst.symbol]);

  const chg = ctx ? ctx.markPx / ctx.prevDayPx - 1 : null;
  const chgAbs = ctx ? ctx.markPx - ctx.prevDayPx : null;
  const spread = q ? q.ask - q.bid : null;
  const spreadBps = q ? ((q.ask - q.bid) / ((q.ask + q.bid) / 2)) * 10_000 : null;
  // Hyperliquid funding is paid hourly; annualised = hourly × 24 × 365.
  const fundingAnn = ctx ? ctx.funding * 24 * 365 : null;

  return (
    <div className="shrink-0 border-b border-line px-3 pt-2 pb-2">
      <div className="flex items-baseline justify-between">
        <span className="panel-title">Market · {inst.display}</span>
        <span className="text-[10px] text-fg-mute">Hyperliquid</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("num text-[22px] leading-tight font-semibold", chg == null ? "text-fg" : chg >= 0 ? "text-up" : "text-down")}>
          {ctx ? fmtPrice(ctx.markPx, inst.pxDecimals) : "—"}
        </span>
        <span className={cn("num text-[11px]", chg == null ? "text-fg-mute" : chg >= 0 ? "text-up" : "text-down")}>
          {chgAbs != null ? `${chgAbs >= 0 ? "+" : ""}${fmtPrice(chgAbs, inst.pxDecimals)}` : ""} {fmtPct(chg)}
        </span>
      </div>
      {!ctx && <p className="text-[10px] text-fg-mute">Waiting for live market context…</p>}
      <div className="mt-1 grid grid-cols-2 gap-x-4">
        <Stat label="Bid" value={fmtPrice(q?.bid, inst.pxDecimals)} tone="up" />
        <Stat label="Ask" value={fmtPrice(q?.ask, inst.pxDecimals)} tone="down" />
        <Stat
          label="Spread"
          value={spread != null ? `${fmtPrice(spread, inst.pxDecimals)} · ${spreadBps!.toFixed(1)}bp` : "—"}
          tone="dim"
        />
        <Stat label="Oracle" value={fmtPrice(ctx?.oraclePx, inst.pxDecimals)} tone="dim" />
        <Stat label="24h vol" value={fmtCompactUsd(ctx?.dayNotionalVolume)} />
        <Stat
          label="Open int."
          value={ctx ? fmtCompactUsd(ctx.openInterest * ctx.markPx) : "—"}
          title={ctx ? `${fmtNum(ctx.openInterest, 2)} ${inst.base}` : undefined}
        />
        <Stat
          label="Funding 1h"
          value={fmtPct(ctx?.funding, 4)}
          tone={ctx ? (ctx.funding >= 0 ? "up" : "down") : undefined}
        />
        <Stat label="Funding APR" value={fmtPct(fundingAnn, 1)} tone="dim" />
      </div>
    </div>
  );
}
