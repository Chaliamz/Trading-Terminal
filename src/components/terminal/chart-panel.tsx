"use client";

import dynamic from "next/dynamic";
import { AlertTriangle, Loader2, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { INTERVAL_LABEL } from "@/lib/market/types";
import { fmtDuration, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActiveInstrument, useServerNow, useStructure } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import { useUiStore, type OverlayToggles } from "@/store/ui-store";

const ChartCanvas = dynamic(() => import("@/components/chart/chart-canvas"), {
  ssr: false,
  loading: () => <CenterNote icon={<Loader2 className="size-4 animate-spin" />} text="Loading chart engine…" />,
});

const QUICK_TOGGLES: Array<{ key: keyof OverlayToggles; label: string }> = [
  { key: "swings", label: "Swings" },
  { key: "bos", label: "BOS" },
  { key: "choch", label: "CHoCH" },
  { key: "sweeps", label: "Sweeps" },
  { key: "fvg", label: "FVG" },
];

export function ChartPanel() {
  const inst = useActiveInstrument();
  const interval = useUiStore((s) => s.interval);
  const expanded = useUiStore((s) => s.chartExpanded);
  const toggleExpanded = useUiStore((s) => s.toggleChartExpanded);
  const overlays = useUiStore((s) => s.overlays);
  const setOverlay = useUiStore((s) => s.setOverlay);
  const candleState = useMarketStore((s) => s.candleState);
  const reload = useMarketStore((s) => s.reloadCandles);
  const lastCandle = useMarketStore((s) => s.candles[s.candles.length - 1] ?? null);
  const barCount = useMarketStore((s) => s.candles.length);
  const quote = useMarketStore((s) => s.quotes[inst.symbol]);
  const now = useServerNow(1000);
  const structure = useStructure();

  const remaining = lastCandle && now != null ? lastCandle.closeTime + 1 - now : null;
  const trend = structure?.trend ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-line px-3">
        <span className="text-[12px] font-semibold text-fg">{inst.display}</span>
        <Badge variant="muted" className="num">
          {INTERVAL_LABEL[interval]}
        </Badge>
        {quote && (
          <span className="num hidden text-[11px] lg:inline">
            <span className="text-up">{fmtPrice(quote.bid, inst.pxDecimals)}</span>
            <span className="mx-1 text-fg-mute">/</span>
            <span className="text-down">{fmtPrice(quote.ask, inst.pxDecimals)}</span>
          </span>
        )}
        <span className="num text-[10.5px] text-fg-mute">
          Bar closes in{" "}
          <span className="text-fg-dim">{remaining != null && remaining > 0 ? fmtDuration(remaining) : "—"}</span>
        </span>
        {trend && (
          <Badge variant={trend === "bullish" ? "up" : "down"}>Structure {trend === "bullish" ? "▲ bull" : "▼ bear"}</Badge>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {QUICK_TOGGLES.map((t) => (
            <Button
              key={t.key}
              variant="segment"
              size="xs"
              data-active={overlays[t.key]}
              aria-pressed={overlays[t.key]}
              onClick={() => setOverlay(t.key, !overlays[t.key])}
            >
              {t.label}
            </Button>
          ))}
          <div className="mx-1 h-4 w-px bg-line" />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => toggleExpanded()}
            aria-label={expanded ? "Restore layout" : "Expand chart"}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <ChartCanvas />
        {candleState.status === "loading" && (
          <Overlay>
            <CenterNote
              icon={<Loader2 className="size-4 animate-spin text-accent" />}
              text={`Loading ${inst.display} ${INTERVAL_LABEL[interval]} history from Hyperliquid…`}
            />
          </Overlay>
        )}
        {candleState.status === "error" && (
          <Overlay>
            <div className="flex max-w-md flex-col items-center gap-3 rounded-md border border-down/40 bg-panel-2 p-4 text-center">
              <AlertTriangle className="size-5 text-down" />
              <div className="text-[12px] font-semibold text-fg">Market data unavailable</div>
              <p className="text-[11px] text-fg-dim">{candleState.error}</p>
              <p className="text-[10px] text-fg-mute">No prices are shown rather than displaying fabricated data.</p>
              <Button size="sm" variant="secondary" onClick={reload}>
                <RotateCcw /> Retry
              </Button>
            </div>
          </Overlay>
        )}
        <div className="pointer-events-none absolute right-16 bottom-7 z-10 text-[10px] text-fg-mute">
          {barCount > 0 && `${barCount} bars · UTC`}
        </div>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className={cn("absolute inset-0 z-20 flex items-center justify-center bg-panel/70 backdrop-blur-[1px]")}>{children}</div>;
}

function CenterNote({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-[11px] text-fg-dim">
      {icon}
      {text}
    </div>
  );
}
