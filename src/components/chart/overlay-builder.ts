import type { SeriesMarker, Time, UTCTimestamp } from "lightweight-charts";
import type { StructureResult } from "@/lib/structure";
import type { OverlayToggles } from "@/store/ui-store";
import type { OverlayBox, OverlayData, OverlaySegment } from "./structure-primitive";

export const CHART_COLORS = {
  bg: "#0e1013",
  grid: "#151a20",
  text: "#8b95a1",
  border: "#20252c",
  up: "#12c77e",
  down: "#f0414d",
  upVol: "rgba(18,199,126,0.28)",
  downVol: "rgba(240,65,77,0.28)",
  accent: "#2f8cff",
  warn: "#f5b13d",
  swing: "#9aa3ae",
  choch: "#c084fc",
};

const sec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

/** Caps to keep the chart legible on long histories. */
const MAX_BREAKS = 40;
const MAX_FVGS = 30;
const MAX_SWINGS = 120;
const MAX_SWEEPS = 40;

export function buildOverlays(
  s: StructureResult | null,
  t: OverlayToggles,
): { data: OverlayData; markers: SeriesMarker<Time>[] } {
  const segments: OverlaySegment[] = [];
  const boxes: OverlayBox[] = [];
  const markers: SeriesMarker<Time>[] = [];
  if (!s) return { data: { segments, boxes }, markers };

  for (const b of s.breaks.slice(-MAX_BREAKS)) {
    if (b.kind === "BOS" && !t.bos) continue;
    if (b.kind === "CHoCH" && !t.choch) continue;
    const color = b.kind === "CHoCH" ? CHART_COLORS.choch : b.direction === "bullish" ? CHART_COLORS.up : CHART_COLORS.down;
    segments.push({
      from: sec(b.swingTime),
      to: sec(b.breakTime),
      price: b.level,
      color,
      dashed: b.kind === "BOS",
      label: b.kind,
    });
  }

  if (t.fvg) {
    const gaps = s.fvgs.filter((g) => t.filledFvg || g.status !== "filled").slice(-MAX_FVGS);
    for (const g of gaps) {
      const bull = g.direction === "bullish";
      const filled = g.status === "filled";
      boxes.push({
        from: sec(g.startTime),
        to: filled && g.filledTime != null ? sec(g.filledTime) : null,
        top: g.top,
        bottom: g.bottom,
        fill: bull ? (filled ? "rgba(18,199,126,0.05)" : "rgba(18,199,126,0.12)") : filled ? "rgba(240,65,77,0.05)" : "rgba(240,65,77,0.12)",
        stroke: bull ? "rgba(18,199,126,0.55)" : "rgba(240,65,77,0.55)",
        label: `FVG${g.status === "partial" ? ` ${Math.round(g.fillPct * 100)}%` : filled ? " ✓" : ""}`,
      });
    }
  }

  if (t.swings) {
    for (const sw of s.swings.slice(-MAX_SWINGS)) {
      markers.push({
        time: sec(sw.time),
        position: sw.kind === "high" ? "aboveBar" : "belowBar",
        shape: "circle",
        size: 0.4,
        color: CHART_COLORS.swing,
        text: sw.label ?? (sw.kind === "high" ? "SH" : "SL"),
      });
    }
  }

  if (t.sweeps) {
    for (const sw of s.sweeps.slice(-MAX_SWEEPS)) {
      const bearish = sw.direction === "bearish";
      markers.push({
        time: sec(sw.time),
        position: bearish ? "aboveBar" : "belowBar",
        shape: bearish ? "arrowDown" : "arrowUp",
        color: CHART_COLORS.warn,
        text: "SWEEP",
      });
      segments.push({
        from: sec(sw.swingTime),
        to: sec(sw.time),
        price: sw.level,
        color: "rgba(245,177,61,0.7)",
        dashed: true,
        label: "$$",
      });
    }
  }

  // Markers must be sorted by time for the markers plugin.
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  return { data: { segments, boxes }, markers };
}
