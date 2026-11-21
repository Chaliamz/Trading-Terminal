"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { INTERVAL_LABEL, INTERVALS } from "@/lib/market/types";
import { HYPERLIQUID_INSTRUMENTS } from "@/lib/market/hyperliquid/instruments";
import { fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMarketStore } from "@/store/market-store";
import { useUiStore } from "@/store/ui-store";

export function TopBar() {
  const activeSymbol = useUiStore((s) => s.activeSymbol);
  const setActiveSymbol = useUiStore((s) => s.setActiveSymbol);
  const interval = useUiStore((s) => s.interval);
  const setInterval = useUiStore((s) => s.setInterval);
  const expanded = useUiStore((s) => s.chartExpanded);
  const toggleExpanded = useUiStore((s) => s.toggleChartExpanded);
  const contexts = useMarketStore((s) => s.contexts);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid size-6 place-items-center rounded-sm bg-accent text-[11px] font-black text-white">A</div>
        <div className="leading-none">
          <div className="text-[12px] font-bold tracking-[0.2em] text-fg">APEX</div>
          <div className="text-[9px] tracking-[0.3em] text-fg-mute">TERMINAL</div>
        </div>
      </div>

      <div className="h-6 w-px bg-line" />

      <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Instrument">
        {HYPERLIQUID_INSTRUMENTS.map((inst) => {
          const ctx = contexts[inst.symbol];
          const chg = ctx ? ctx.markPx / ctx.prevDayPx - 1 : null;
          const active = inst.symbol === activeSymbol;
          return (
            <button
              key={inst.symbol}
              type="button"
              onClick={() => setActiveSymbol(inst.symbol)}
              aria-pressed={active}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 transition-colors",
                active ? "border-accent/60 bg-accent-dim" : "border-transparent hover:bg-panel-3",
              )}
            >
              <span className={cn("text-[12px] font-semibold", active ? "text-fg" : "text-fg-dim")}>{inst.display}</span>
              <span className="num text-[11px] text-fg">{ctx ? fmtPrice(ctx.markPx, inst.pxDecimals) : "—"}</span>
              <span className={cn("num text-[10px]", chg == null ? "text-fg-mute" : chg >= 0 ? "text-up" : "text-down")}>
                {fmtPct(chg)}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="h-6 w-px bg-line" />

      <div className="flex items-center rounded-md border border-line bg-panel-2 p-0.5" role="group" aria-label="Timeframe">
        {INTERVALS.map((iv) => (
          <Button
            key={iv}
            variant="segment"
            size="xs"
            data-active={iv === interval}
            aria-pressed={iv === interval}
            onClick={() => setInterval(iv)}
            className="num w-9"
          >
            {INTERVAL_LABEL[iv]}
          </Button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="warn">Paper trading</Badge>
          </TooltipTrigger>
          <TooltipContent>All orders are simulated locally. Nothing is sent to any exchange.</TooltipContent>
        </Tooltip>
        <Badge variant="outline" className="hidden md:inline-flex">
          Hyperliquid · Perps
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => toggleExpanded()}
              aria-label={expanded ? "Restore layout" : "Expand chart"}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{expanded ? "Restore layout (Esc / F)" : "Expand chart (F)"}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
