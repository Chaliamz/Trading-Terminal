"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  closePosition,
  createAccount,
  DEFAULT_STARTING_BALANCE,
  openPosition,
  updateProtection,
  type CloseReason,
  type OpenOrder,
  type PaperAccount,
  type PaperQuote,
} from "@/lib/paper/engine";
import { migratePaperState, PAPER_STORE_VERSION } from "@/lib/paper/persistence";

export interface PaperEvent {
  id: number;
  at: number;
  kind: "fill" | "close" | "reject" | "info";
  text: string;
}

type Quotes = Record<string, PaperQuote | undefined>;

interface PaperState {
  account: PaperAccount;
  events: PaperEvent[];
  hydrated: boolean;

  placeOrder: (o: OpenOrder, quotes: Quotes) => { ok: boolean; message: string };
  close: (positionId: string, quotes: Quotes, reason?: CloseReason) => { ok: boolean; message: string };
  setProtection: (
    positionId: string,
    sl: number | null,
    tp: number | null,
    quotes: Quotes,
  ) => { ok: boolean; message: string };
  setTradeNote: (tradeId: string, note: string) => void;
  setFeeRate: (rate: number) => void;
  setLeverageCap: (cap: number) => void;
  reset: (startingBalance?: number) => void;
  pushEvent: (kind: PaperEvent["kind"], text: string) => void;
}

let eventSeq = 0;
const MAX_EVENTS = 50;

export const usePaperStore = create<PaperState>()(
  persist(
    (set, get) => {
      const push = (kind: PaperEvent["kind"], text: string) =>
        set((s) => ({ events: [{ id: ++eventSeq, at: Date.now(), kind, text }, ...s.events].slice(0, MAX_EVENTS) }));

      return {
        account: createAccount(0, DEFAULT_STARTING_BALANCE),
        events: [],
        hydrated: false,

        placeOrder: (order, quotes) => {
          const r = openPosition(get().account, order, quotes[order.symbol], quotes, Date.now());
          if (!r.ok) {
            push("reject", r.error);
            return { ok: false, message: r.error };
          }
          set({ account: r.account });
          push("fill", r.message);
          return { ok: true, message: r.message };
        },

        close: (positionId, quotes, reason = "manual") => {
          const pos = get().account.positions.find((p) => p.id === positionId);
          const r = closePosition(get().account, positionId, pos ? quotes[pos.symbol] : undefined, reason, Date.now());
          if (!r.ok) {
            push("reject", r.error);
            return { ok: false, message: r.error };
          }
          set({ account: r.account });
          push("close", r.message);
          return { ok: true, message: r.message };
        },

        setProtection: (positionId, sl, tp, quotes) => {
          const pos = get().account.positions.find((p) => p.id === positionId);
          const r = updateProtection(get().account, positionId, sl, tp, pos ? quotes[pos.symbol] : undefined);
          if (!r.ok) {
            push("reject", r.error);
            return { ok: false, message: r.error };
          }
          set({ account: r.account });
          return { ok: true, message: r.message };
        },

        setTradeNote: (tradeId, note) =>
          set((s) => ({
            account: {
              ...s.account,
              trades: s.account.trades.map((t) => (t.id === tradeId ? { ...t, note: note.slice(0, 500) } : t)),
            },
          })),

        setFeeRate: (rate) => {
          if (!Number.isFinite(rate) || rate < 0 || rate >= 0.05) return;
          set((s) => ({ account: { ...s.account, feeRate: rate } }));
        },

        setLeverageCap: (cap) => {
          if (!Number.isFinite(cap) || cap < 1 || cap > 50) return;
          set((s) => ({ account: { ...s.account, leverageCap: cap } }));
        },

        reset: (startingBalance = DEFAULT_STARTING_BALANCE) => {
          const prev = get().account;
          set({
            account: { ...createAccount(Date.now(), startingBalance), feeRate: prev.feeRate, leverageCap: prev.leverageCap },
            events: [],
          });
          push("info", `Paper account reset to $${startingBalance.toLocaleString("en-US")}`);
        },

        pushEvent: push,
      };
    },
    {
      name: "apex.paper.v1",
      version: PAPER_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({ account: s.account }),
      migrate: (persisted) => migratePaperState(persisted),
      merge: (persisted, current) => {
        const p = migratePaperState(persisted);
        return { ...current, account: p.account };
      },
      onRehydrateStorage: () => (state) => {
        if (state && state.account.createdAt === 0) state.account.createdAt = Date.now();
        usePaperStore.setState({ hydrated: true });
      },
    },
  ),
);
