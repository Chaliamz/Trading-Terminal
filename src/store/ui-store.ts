"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Interval } from "@/lib/market/types";
import { DEFAULT_STRUCTURE_CONFIG, type StructureConfig } from "@/lib/structure/types";
import type { Side } from "@/lib/risk/position-size";

export interface OverlayToggles {
  swings: boolean;
  bos: boolean;
  choch: boolean;
  sweeps: boolean;
  fvg: boolean;
  filledFvg: boolean;
  positions: boolean;
  volume: boolean;
}

export const DEFAULT_OVERLAYS: OverlayToggles = {
  swings: true,
  bos: true,
  choch: true,
  sweeps: true,
  fvg: true,
  filledFvg: false,
  positions: true,
  volume: true,
};

export type RightTab = "order" | "risk" | "structure";
export type BottomTab = "positions" | "journal";

export interface TicketDraft {
  symbol: string;
  side: Side;
  size: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Changes on every send so the ticket re-applies an identical draft. */
  nonce: number;
}

interface UiState {
  activeSymbol: string;
  interval: Interval;
  chartExpanded: boolean;
  overlays: OverlayToggles;
  structure: StructureConfig;
  rightTab: RightTab;
  bottomTab: BottomTab;
  ticketDraft: TicketDraft | null;

  setActiveSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  toggleChartExpanded: (v?: boolean) => void;
  setOverlay: (k: keyof OverlayToggles, v: boolean) => void;
  setStructure: (patch: Partial<StructureConfig>) => void;
  resetStructure: () => void;
  setRightTab: (t: RightTab) => void;
  setBottomTab: (t: BottomTab) => void;
  sendToTicket: (d: Omit<TicketDraft, "nonce">) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeSymbol: "BTC",
      interval: "15m",
      chartExpanded: false,
      overlays: DEFAULT_OVERLAYS,
      structure: DEFAULT_STRUCTURE_CONFIG,
      rightTab: "order",
      bottomTab: "positions",
      ticketDraft: null,

      setActiveSymbol: (activeSymbol) => set({ activeSymbol }),
      setInterval: (interval) => set({ interval }),
      toggleChartExpanded: (v) => set((s) => ({ chartExpanded: v ?? !s.chartExpanded })),
      setOverlay: (k, v) => set((s) => ({ overlays: { ...s.overlays, [k]: v } })),
      setStructure: (patch) => set((s) => ({ structure: { ...s.structure, ...patch } })),
      resetStructure: () => set({ structure: DEFAULT_STRUCTURE_CONFIG }),
      setRightTab: (rightTab) => set({ rightTab }),
      setBottomTab: (bottomTab) => set({ bottomTab }),
      sendToTicket: (d) => set({ ticketDraft: { ...d, nonce: Date.now() }, rightTab: "order" }),
    }),
    {
      name: "apex.ui.v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        activeSymbol: s.activeSymbol,
        interval: s.interval,
        overlays: s.overlays,
        structure: s.structure,
        rightTab: s.rightTab,
        bottomTab: s.bottomTab,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...p,
          overlays: { ...DEFAULT_OVERLAYS, ...(p.overlays ?? {}) },
          structure: { ...DEFAULT_STRUCTURE_CONFIG, ...(p.structure ?? {}) },
        };
      },
    },
  ),
);
