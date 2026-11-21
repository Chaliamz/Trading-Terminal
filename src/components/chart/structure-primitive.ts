import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

type CanvasRenderingTarget2D = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export interface OverlaySegment {
  from: UTCTimestamp;
  to: UTCTimestamp;
  price: number;
  color: string;
  dashed: boolean;
  label: string;
}

export interface OverlayBox {
  from: UTCTimestamp;
  /** null → extend to the right edge of the pane (unmitigated). */
  to: UTCTimestamp | null;
  top: number;
  bottom: number;
  fill: string;
  stroke: string;
  label: string;
}

export interface OverlayData {
  segments: OverlaySegment[];
  boxes: OverlayBox[];
}

const FONT = "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";

class Renderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly data: OverlayData,
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<SeriesType>,
  ) {}

  /** Boxes go to the background so candles stay readable on top of them. */
  drawBackground(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const ts = this.chart.timeScale();
      ctx.font = FONT;
      for (const b of this.data.boxes) {
        const x1 = ts.timeToCoordinate(b.from as Time);
        const x2 = b.to == null ? mediaSize.width : ts.timeToCoordinate(b.to as Time);
        const y1 = this.series.priceToCoordinate(b.top);
        const y2 = this.series.priceToCoordinate(b.bottom);
        if (x1 == null || x2 == null || y1 == null || y2 == null) continue;
        const left = Math.min(x1, x2);
        const w = Math.max(1, Math.abs(x2 - x1));
        const top = Math.min(y1, y2);
        const h = Math.max(1, Math.abs(y2 - y1));
        if (left > mediaSize.width || left + w < 0) continue;
        ctx.fillStyle = b.fill;
        ctx.fillRect(left, top, w, h);
        ctx.strokeStyle = b.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.round(w), Math.round(h));
        // Label only when the box's origin is on screen; boxes from off-screen history stay unlabelled.
        if (h >= 9 && left >= 0) {
          ctx.fillStyle = b.stroke;
          ctx.textBaseline = "top";
          ctx.fillText(b.label, left + 3, top + 2);
        }
      }
    });
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const ts = this.chart.timeScale();
      ctx.font = FONT;
      for (const s of this.data.segments) {
        const x1 = ts.timeToCoordinate(s.from as Time);
        const x2 = ts.timeToCoordinate(s.to as Time);
        const y = this.series.priceToCoordinate(s.price);
        if (x1 == null || x2 == null || y == null) continue;
        if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > mediaSize.width) continue;
        const yy = Math.round(y) + 0.5;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1;
        ctx.setLineDash(s.dashed ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(x1, yy);
        ctx.lineTo(x2, yy);
        ctx.stroke();
        ctx.setLineDash([]);
        const tw = ctx.measureText(s.label).width;
        const mid = (x1 + x2) / 2;
        ctx.fillStyle = s.color;
        ctx.textBaseline = "bottom";
        ctx.fillText(s.label, mid - tw / 2, yy - 2);
      }
    });
  }
}

class PaneView implements IPrimitivePaneView {
  constructor(private readonly source: StructurePrimitive) {}
  zOrder() {
    return "normal" as const;
  }
  renderer() {
    const { chart, series } = this.source.refs();
    if (!chart || !series) return null;
    return new Renderer(this.source.data(), chart, series);
  }
}

/** Draws BOS/CHoCH segments and FVG boxes on the candlestick series. */
export class StructurePrimitive implements ISeriesPrimitive<Time> {
  private _data: OverlayData = { segments: [], boxes: [] };
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private readonly _views: readonly IPrimitivePaneView[] = [new PaneView(this)];

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<SeriesType>;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews() {
    return this._views;
  }

  setData(data: OverlayData) {
    this._data = data;
    this._requestUpdate?.();
  }

  data() {
    return this._data;
  }

  refs() {
    return { chart: this._chart, series: this._series };
  }
}
