"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/types";
import { fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useActiveInstrument, useStructure } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import { usePaperStore } from "@/store/paper-store";
import { useUiStore } from "@/store/ui-store";
import { buildOverlays, CHART_COLORS } from "./overlay-builder";
import { StructurePrimitive } from "./structure-primitive";

const sec = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
const toBar = (c: Candle): CandlestickData<Time> => ({
  time: sec(c.time),
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
});
const toVol = (c: Candle): HistogramData<Time> => ({
  time: sec(c.time),
  value: c.volume,
  color: c.close >= c.open ? CHART_COLORS.upVol : CHART_COLORS.downVol,
});

/** Visible bars after an instrument / timeframe switch. */
const INITIAL_VISIBLE_BARS = 160;

interface Refs {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  markers: ISeriesMarkersPluginApi<Time>;
  primitive: StructurePrimitive;
}

/**
 * Lightweight Charts host. Client-only (loaded through next/dynamic with ssr:false).
 * Candle data is pushed imperatively from the market store to avoid re-rendering
 * React on every tick.
 */
export default function ChartCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = useRef<Refs | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const inst = useActiveInstrument();
  const overlays = useUiStore((s) => s.overlays);
  const structure = useStructure();
  const positions = usePaperStore((s) => s.account.positions);
  const lastCandle = useMarketStore((s) => s.candles[s.candles.length - 1] ?? null);

  // ---- create / destroy chart ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.text,
        fontSize: 11,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3a4350", labelBackgroundColor: "#262c34" },
        horzLine: { color: "#3a4350", labelBackgroundColor: "#262c34" },
      },
      rightPriceScale: { borderColor: CHART_COLORS.border },
      timeScale: { borderColor: CHART_COLORS.border, timeVisible: true, secondsVisible: false, rightOffset: 8 },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.up,
      downColor: CHART_COLORS.down,
      wickUpColor: CHART_COLORS.up,
      wickDownColor: CHART_COLORS.down,
      borderVisible: false,
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const markers = createSeriesMarkers(candles, []);
    const primitive = new StructurePrimitive();
    candles.attachPrimitive(primitive);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const bar = param.seriesData.get(candles) as CandlestickData<Time> | undefined;
      if (!bar || bar.open === undefined) {
        setHover(null);
        return;
      }
      const t = (param.time as number) * 1000;
      const src = useMarketStore.getState().candles;
      const found = src.find((c) => c.time === t);
      setHover(found ?? null);
    });

    refs.current = { chart, candles, volume, markers, primitive };
    return () => {
      refs.current = null;
      chart.remove();
    };
  }, []);

  // ---- push candle data from the store ----
  useEffect(() => {
    let prev: Candle[] = [];
    let prevSeq = -1;
    let prevKey: string | null = null;

    const apply = (s: ReturnType<typeof useMarketStore.getState>) => {
      const r = refs.current;
      if (!r) return;
      const next = s.candles;
      const keyChanged = s.candleKey !== prevKey;
      if (keyChanged || s.candleResetSeq !== prevSeq) {
        r.candles.setData(next.map(toBar));
        r.volume.setData(next.map(toVol));
        if (keyChanged || prev.length === 0) {
          if (next.length > 0) {
            r.chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, next.length - INITIAL_VISIBLE_BARS),
              to: next.length + 8,
            });
          }
        }
        prevKey = s.candleKey;
        prevSeq = s.candleResetSeq;
        // Only treat the dataset as initialised once it actually has bars.
        prev = next;
        if (next.length === 0) prevKey = null;
        return;
      }
      if (next === prev) return;
      const n = next.length;
      const p = prev.length;
      try {
        if (n === p && n > 0 && next[n - 1].time === prev[p - 1].time && (n < 2 || next[n - 2] === prev[p - 2])) {
          r.candles.update(toBar(next[n - 1]));
          r.volume.update(toVol(next[n - 1]));
        } else if (n === p + 1 && p > 0 && next[n - 2].time === prev[p - 1].time) {
          r.candles.update(toBar(next[n - 2]));
          r.volume.update(toVol(next[n - 2]));
          r.candles.update(toBar(next[n - 1]));
          r.volume.update(toVol(next[n - 1]));
        } else {
          r.candles.setData(next.map(toBar));
          r.volume.setData(next.map(toVol));
        }
      } catch {
        // Out-of-order update rejected by the chart: fall back to a full reload.
        r.candles.setData(next.map(toBar));
        r.volume.setData(next.map(toVol));
      }
      prev = next;
    };

    apply(useMarketStore.getState());
    return useMarketStore.subscribe(apply);
  }, []);

  // ---- instrument precision ----
  useEffect(() => {
    refs.current?.candles.applyOptions({
      priceFormat: { type: "price", precision: inst.pxDecimals, minMove: 10 ** -inst.pxDecimals },
    });
  }, [inst.pxDecimals]);

  // ---- volume visibility ----
  useEffect(() => {
    refs.current?.volume.applyOptions({ visible: overlays.volume });
  }, [overlays.volume]);

  // ---- structure overlays ----
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const { data, markers } = buildOverlays(structure, overlays);
    r.primitive.setData(data);
    r.markers.setMarkers(markers);
  }, [structure, overlays]);

  // ---- paper position lines ----
  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    const lines: IPriceLine[] = [];
    if (overlays.positions) {
      for (const p of positions) {
        if (p.symbol !== inst.symbol) continue;
        const long = p.side === "long";
        lines.push(
          r.candles.createPriceLine({
            price: p.entryPrice,
            color: CHART_COLORS.accent,
            lineWidth: 1,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `${long ? "LONG" : "SHORT"} ${p.size}`,
          }),
        );
        if (p.stopLoss != null)
          lines.push(
            r.candles.createPriceLine({
              price: p.stopLoss,
              color: CHART_COLORS.down,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "SL",
            }),
          );
        if (p.takeProfit != null)
          lines.push(
            r.candles.createPriceLine({
              price: p.takeProfit,
              color: CHART_COLORS.up,
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "TP",
            }),
          );
      }
    }
    return () => {
      for (const l of lines) r.candles.removePriceLine(l);
    };
  }, [positions, inst.symbol, overlays.positions]);

  const legend = hover ?? lastCandle;
  const chg = legend ? legend.close / legend.open - 1 : null;
  const up = legend ? legend.close >= legend.open : true;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" data-testid="chart-container" />
      {legend && (
        <div className="pointer-events-none absolute top-1 left-1 z-10 flex flex-wrap items-center gap-x-2.5 rounded-sm bg-panel/90 px-1.5 py-0.5 text-[10.5px]">
          <Field k="O" v={fmtPrice(legend.open, inst.pxDecimals)} up={up} />
          <Field k="H" v={fmtPrice(legend.high, inst.pxDecimals)} up={up} />
          <Field k="L" v={fmtPrice(legend.low, inst.pxDecimals)} up={up} />
          <Field k="C" v={fmtPrice(legend.close, inst.pxDecimals)} up={up} />
          <span className={cn("num", up ? "text-up" : "text-down")}>{fmtPct(chg)}</span>
          <span className="num text-fg-mute">
            Vol {fmtNum(legend.volume, 2)} {inst.base}
          </span>
        </div>
      )}
    </div>
  );
}

function Field({ k, v, up }: { k: string; v: string; up: boolean }) {
  return (
    <span className="num">
      <span className="text-fg-mute">{k} </span>
      <span className={up ? "text-up" : "text-down"}>{v}</span>
    </span>
  );
}
