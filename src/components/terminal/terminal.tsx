"use client";

import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui-store";
import { usePaperStore } from "@/store/paper-store";
import { cn } from "@/lib/utils";
import { TopBar } from "./top-bar";
import { Watchlist } from "./watchlist";
import { ChartPanel } from "./chart-panel";
import { RightPanel } from "./right-panel";
import { BottomPanel } from "./bottom-panel";
import { StatusBar } from "./status-bar";
import { MarketDataController } from "./market-data-controller";
import { PaperTradingController } from "./paper-trading-controller";

/**
 * Root workstation layout.
 *   ┌──────────── top bar ────────────┐
 *   │ watch │      chart       │ info │
 *   │ list  ├──────────────────┤ & ctl│
 *   │       │ positions/journal│      │
 *   └────────── status bar ───────────┘
 * Below the xl breakpoint the side columns collapse beneath the chart.
 */
export function Terminal() {
  const expanded = useUiStore((s) => s.chartExpanded);
  const toggleExpanded = useUiStore((s) => s.toggleChartExpanded);
  const [hydrated, setHydrated] = useState(false);

  // Persisted stores use skipHydration so the server-rendered shell matches the
  // first client render; rehydrate from localStorage after mount.
  useEffect(() => {
    Promise.all([useUiStore.persist.rehydrate(), usePaperStore.persist.rehydrate()]).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "Escape" && useUiStore.getState().chartExpanded) toggleExpanded(false);
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) toggleExpanded();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleExpanded]);

  return (
    <TooltipProvider>
      {hydrated && <MarketDataController />}
      {hydrated && <PaperTradingController />}
      <div className="flex h-dvh flex-col bg-background text-fg">
        <TopBar />
        <div
          className={cn(
            "min-h-0 flex-1 gap-px bg-line",
            expanded
              ? "grid grid-cols-1"
              : "flex flex-col overflow-y-auto xl:grid xl:grid-cols-[232px_minmax(0,1fr)_330px] xl:overflow-hidden",
          )}
        >
          {!expanded && (
            <aside className="order-2 bg-panel xl:order-none xl:min-h-0">
              <Watchlist />
            </aside>
          )}
          <main
            className={cn(
              "order-1 flex min-h-0 flex-col gap-px bg-line xl:order-none",
              !expanded && "min-h-[640px] xl:min-h-0",
            )}
          >
            <section className={cn("min-h-[380px] flex-1 bg-panel", expanded && "min-h-0")}>
              {hydrated ? <ChartPanel /> : <ShellLoading />}
            </section>
            {!expanded && (
              <section className="h-[260px] shrink-0 bg-panel">
                <BottomPanel />
              </section>
            )}
          </main>
          {!expanded && (
            <aside className="order-3 bg-panel xl:order-none xl:min-h-0">
              <RightPanel />
            </aside>
          )}
        </div>
        <StatusBar />
      </div>
    </TooltipProvider>
  );
}

function ShellLoading() {
  return (
    <div className="flex h-full items-center justify-center text-[11px] tracking-widest text-fg-mute uppercase">
      Initialising workstation…
    </div>
  );
}
