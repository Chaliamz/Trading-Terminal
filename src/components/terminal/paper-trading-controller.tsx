"use client";

import { useEffect } from "react";
import { findTriggers } from "@/lib/paper/engine";
import { freshPaperQuotes } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import { usePaperStore } from "@/store/paper-store";

/**
 * Evaluates simulated stop-loss / take-profit orders on every top-of-book
 * update. Runs outside React rendering via store subscriptions.
 */
export function PaperTradingController() {
  useEffect(() => {
    return useMarketStore.subscribe((state, prev) => {
      if (state.quotes === prev.quotes) return;
      const paper = usePaperStore.getState();
      if (!paper.hydrated || paper.account.positions.length === 0) return;
      const fresh = freshPaperQuotes(state.quotes, Date.now());
      for (const [symbol, q] of Object.entries(state.quotes)) {
        if (prev.quotes[symbol] === q) continue;
        const pq = fresh[symbol];
        if (!pq) continue;
        for (const hit of findTriggers(usePaperStore.getState().account, symbol, pq)) {
          usePaperStore.getState().close(hit.positionId, fresh, hit.reason);
        }
      }
    });
  }, []);
  return null;
}
