"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fmtPrice, fmtUtcDateTime } from "@/lib/format";
import { cn, parseDecimal } from "@/lib/utils";
import { useActiveInstrument, useStructure } from "@/hooks/use-market";
import { useUiStore, type OverlayToggles } from "@/store/ui-store";
import { SectionTitle, Stat } from "./fields";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const TOGGLES: Array<{ key: keyof OverlayToggles; label: string; hint: string }> = [
  { key: "swings", label: "Swing highs / lows", hint: "HH · HL · LH · LL labels" },
  { key: "bos", label: "Break of structure", hint: "Continuation breaks" },
  { key: "choch", label: "Change of character", hint: "Counter-trend breaks" },
  { key: "sweeps", label: "Liquidity sweeps", hint: "Wick through, close back" },
  { key: "fvg", label: "Fair value gaps", hint: "Open & partially filled" },
  { key: "filledFvg", label: "Show filled FVGs", hint: "Fully mitigated gaps" },
  { key: "positions", label: "Paper positions", hint: "Entry / SL / TP lines" },
  { key: "volume", label: "Volume", hint: "Histogram pane" },
];

export function StructurePanel() {
  const overlays = useUiStore((s) => s.overlays);
  const setOverlay = useUiStore((s) => s.setOverlay);
  const cfg = useUiStore((s) => s.structure);
  const setCfg = useUiStore((s) => s.setStructure);
  const resetCfg = useUiStore((s) => s.resetStructure);
  const structure = useStructure();
  const inst = useActiveInstrument();

  const lastBreak = structure?.breaks[structure.breaks.length - 1];
  const lastSweep = structure?.sweeps[structure.sweeps.length - 1];
  const openFvgs = structure?.fvgs.filter((g) => g.status !== "filled") ?? [];

  return (
    <div className="flex flex-col gap-1 p-3">
      <SectionTitle>Overlays</SectionTitle>
      <div className="flex flex-col">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between py-1">
            <Label htmlFor={`ov-${t.key}`} className="flex cursor-pointer flex-col items-start gap-0">
              <span className="text-fg">{t.label}</span>
              <span className="text-[10px] font-normal text-fg-mute">{t.hint}</span>
            </Label>
            <Switch id={`ov-${t.key}`} checked={overlays[t.key]} onCheckedChange={(v) => setOverlay(t.key, v)} />
          </div>
        ))}
      </div>

      <SectionTitle
        right={
          <Button variant="ghost" size="xs" onClick={resetCfg}>
            <RotateCcw /> Defaults
          </Button>
        }
      >
        Detection rules
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <IntField
          id="pivot-left"
          label="Pivot left bars"
          value={cfg.left}
          min={1}
          max={20}
          onCommit={(v) => setCfg({ left: v })}
        />
        <IntField
          id="pivot-right"
          label="Pivot right bars"
          value={cfg.right}
          min={1}
          max={20}
          onCommit={(v) => setCfg({ right: v })}
        />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-fg-dim">Break confirmation</span>
        <div className="flex rounded-md border border-line bg-panel-2 p-0.5">
          {(["close", "wick"] as const).map((m) => (
            <Button key={m} variant="segment" size="xs" data-active={cfg.breakOn === m} onClick={() => setCfg({ breakOn: m })}>
              {m === "close" ? "Body close" : "Wick"}
            </Button>
          ))}
        </div>
      </div>
      <FvgMinField value={cfg.fvgMinGapPct} onCommit={(v) => setCfg({ fvgMinGapPct: v })} />
      <p className="mt-1 text-[10px] leading-relaxed text-fg-mute">
        Computed on closed candles only. A pivot is confirmed {cfg.right} bar{cfg.right > 1 ? "s" : ""} after it
        forms, so labels appear with that delay — by design, to avoid look-ahead bias.
      </p>

      <SectionTitle>Current read</SectionTitle>
      {!structure && <p className="text-[10.5px] text-fg-mute">Waiting for closed candles…</p>}
      {structure && (
        <div className="rounded-md border border-line bg-panel-2 px-2.5 py-1.5">
          <Stat
            label="Trend"
            value={structure.trend ? (structure.trend === "bullish" ? "Bullish" : "Bearish") : "Undetermined"}
            tone={structure.trend === "bullish" ? "up" : structure.trend === "bearish" ? "down" : "dim"}
          />
          <Stat
            label="Last break"
            value={
              lastBreak
                ? `${lastBreak.kind} ${lastBreak.direction === "bullish" ? "▲" : "▼"} ${fmtPrice(lastBreak.level, inst.pxDecimals)}`
                : "—"
            }
            tone={lastBreak ? (lastBreak.direction === "bullish" ? "up" : "down") : "dim"}
          />
          {lastBreak && <Stat label="Break time" value={fmtUtcDateTime(lastBreak.breakTime)} tone="dim" />}
          <Stat
            label="Last sweep"
            value={
              lastSweep
                ? `${lastSweep.direction === "bearish" ? "Highs" : "Lows"} @ ${fmtPrice(lastSweep.level, inst.pxDecimals)}`
                : "—"
            }
            tone={lastSweep ? "warn" : "dim"}
          />
          <Stat label="Swings / breaks" value={`${structure.swings.length} / ${structure.breaks.length}`} tone="dim" />
          <Stat label="Unfilled FVGs" value={String(openFvgs.length)} tone="dim" />
        </div>
      )}
      {openFvgs.length > 0 && (
        <>
          <SectionTitle>Nearest unfilled FVGs</SectionTitle>
          <ul className="flex flex-col gap-0.5">
            {openFvgs
              .slice(-6)
              .reverse()
              .map((g) => (
                <li key={`${g.createdIndex}-${g.direction}`} className="flex items-center justify-between text-[10.5px]">
                  <span className={cn(g.direction === "bullish" ? "text-up" : "text-down")}>
                    {g.direction === "bullish" ? "Bull" : "Bear"} {g.status === "partial" ? `${Math.round(g.fillPct * 100)}%` : "open"}
                  </span>
                  <span className="num text-fg-dim">
                    {fmtPrice(g.bottom, inst.pxDecimals)} – {fmtPrice(g.top, inst.pxDecimals)}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}

function IntField({
  id,
  label,
  value,
  min,
  max,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(String(value));
  }
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= min && n <= max;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={text}
        aria-invalid={!valid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value);
          if (Number.isInteger(v) && v >= min && v <= max) onCommit(v);
        }}
      />
    </div>
  );
}

function FvgMinField({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(+(value * 100).toFixed(4)));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setText(String(+(value * 100).toFixed(4)));
  }
  const n = parseDecimal(text);
  const valid = n != null && n >= 0 && n <= 5;
  return (
    <div className="mt-1 flex items-center justify-between gap-2">
      <Label htmlFor="fvg-min">Min FVG size (% of price)</Label>
      <Input
        id="fvg-min"
        className="w-20"
        inputMode="decimal"
        value={text}
        aria-invalid={!valid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseDecimal(e.target.value);
          if (v != null && v >= 0 && v <= 5) onCommit(v / 100);
        }}
      />
    </div>
  );
}
