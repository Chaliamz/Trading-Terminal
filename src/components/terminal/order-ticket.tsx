"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { cn, floorTo, newId, parseDecimal } from "@/lib/utils";
import { accountMetrics, entryPriceFor, exitPriceFor, validateProtection, type Side } from "@/lib/paper/engine";
import { currentFreshQuotes, isQuoteFresh, useActiveInstrument, useMarkQuotes, useNow } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import { usePaperStore } from "@/store/paper-store";
import { useUiStore } from "@/store/ui-store";
import { MiniAction, NumField, SectionTitle, Stat } from "./fields";

export function OrderTicket() {
  const inst = useActiveInstrument();
  const quote = useMarketStore((s) => s.quotes[inst.symbol]);
  const draft = useUiStore((s) => s.ticketDraft);
  const account = usePaperStore((s) => s.account);
  const hydrated = usePaperStore((s) => s.hydrated);
  const placeOrder = usePaperStore((s) => s.placeOrder);
  const markQuotes = useMarkQuotes();
  const now = useNow(1000);

  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [appliedNonce, setAppliedNonce] = useState<number | null>(null);
  const [lastSymbol, setLastSymbol] = useState(inst.symbol);

  // Clear stale feedback when switching instrument.
  if (lastSymbol !== inst.symbol) {
    setLastSymbol(inst.symbol);
    setResult(null);
  }

  // Apply a draft sent from the risk calculator (adjusting state during render on change).
  if (draft && draft.nonce !== appliedNonce && draft.symbol === inst.symbol) {
    setAppliedNonce(draft.nonce);
    setSide(draft.side);
    setSize(String(draft.size));
    setSl(draft.stopLoss != null ? String(draft.stopLoss) : "");
    setTp(draft.takeProfit != null ? String(draft.takeProfit) : "");
    setResult({ ok: true, text: "Loaded from risk calculator — review and submit." });
  }

  const sizeN = parseDecimal(size);
  const slN = sl.trim() === "" ? null : parseDecimal(sl);
  const tpN = tp.trim() === "" ? null : parseDecimal(tp);
  const fresh = now != null && isQuoteFresh(quote, now);
  const fill = quote ? entryPriceFor(side, quote) : null;
  const exitRef = quote ? exitPriceFor(side, quote) : null;
  const notional = fill != null && sizeN != null ? fill * sizeN : null;
  const fee = notional != null ? notional * account.feeRate : null;
  const metrics = accountMetrics(account, markQuotes);
  const riskToStop = fill != null && sizeN != null && slN != null ? Math.abs(fill - slN) * sizeN + (fee ?? 0) * 2 : null;

  let error: string | null = null;
  if (size.trim() !== "" && (sizeN == null || sizeN <= 0)) error = "Enter a positive size.";
  else if (sizeN != null && floorTo(sizeN, inst.szDecimals) !== sizeN)
    error = `Size precision is ${inst.szDecimals} decimals for ${inst.base}.`;
  else if ((sl.trim() !== "" && slN == null) || (tp.trim() !== "" && tpN == null)) error = "Invalid price.";
  else if (exitRef != null && sizeN != null) error = validateProtection(side, exitRef, slN, tpN);

  const canSubmit = hydrated && fresh && sizeN != null && sizeN > 0 && !error;

  const submit = () => {
    if (!canSubmit || sizeN == null) return;
    const quotes = currentFreshQuotes();
    const r = placeOrder({ id: newId("pos"), symbol: inst.symbol, side, size: sizeN, stopLoss: slN, takeProfit: tpN }, quotes);
    setResult({ ok: r.ok, text: r.ok ? `${r.message} (simulated)` : r.message });
  };

  const setSizeFromPct = (pct: number) => {
    if (fill == null || !(metrics.equity > 0)) return;
    const s = floorTo((metrics.equity * pct) / fill, inst.szDecimals);
    setSize(s > 0 ? String(s) : "");
  };

  const long = side === "long";

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-dim px-2 py-1.5 text-[10.5px] text-warn">
        <ShieldAlert className="mt-px size-3.5 shrink-0" />
        <span>Simulated execution against live Hyperliquid top-of-book. No order is sent to any exchange.</span>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-panel-2 p-0.5">
        <button
          type="button"
          onClick={() => setSide("long")}
          aria-pressed={long}
          className={cn(
            "h-7 cursor-pointer rounded text-[11px] font-semibold transition-colors",
            long ? "bg-up text-black" : "text-fg-mute hover:text-fg",
          )}
        >
          Buy / Long
        </button>
        <button
          type="button"
          onClick={() => setSide("short")}
          aria-pressed={!long}
          className={cn(
            "h-7 cursor-pointer rounded text-[11px] font-semibold transition-colors",
            !long ? "bg-down text-white" : "text-fg-mute hover:text-fg",
          )}
        >
          Sell / Short
        </button>
      </div>

      <NumField
        id="ticket-size"
        label={`Size (${inst.base})`}
        value={size}
        onChange={setSize}
        suffix={inst.base}
        placeholder={`0.${"0".repeat(Math.max(0, inst.szDecimals - 1))}1`}
        invalid={!!error && error.startsWith("Size")}
        action={
          <span className="flex gap-1.5">
            {[0.1, 0.25, 0.5, 1].map((p) => (
              <MiniAction key={p} onClick={() => setSizeFromPct(p)} disabled={fill == null || !hydrated}>
                {p * 100}%
              </MiniAction>
            ))}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <NumField id="ticket-sl" label="Stop-loss" value={sl} onChange={setSl} placeholder="optional" />
        <NumField id="ticket-tp" label="Take-profit" value={tp} onChange={setTp} placeholder="optional" />
      </div>

      <div className="rounded-md border border-line bg-panel-2 px-2.5 py-1.5">
        <Stat label={`Est. fill (${long ? "ask" : "bid"})`} value={fmtPrice(fill, inst.pxDecimals)} />
        <Stat label="Notional" value={fmtUsd(notional)} />
        <Stat label={`Fee (${fmtPct(account.feeRate, 3, false)})`} value={fmtUsd(fee, 2)} tone="dim" />
        <Stat
          label="Risk to stop"
          value={
            riskToStop != null
              ? `${fmtUsd(riskToStop)} · ${fmtPct(metrics.equity > 0 ? riskToStop / metrics.equity : null, 2, false)}`
              : "no stop"
          }
          tone={riskToStop != null ? "warn" : "dim"}
        />
        <Stat label="Paper equity" value={hydrated ? fmtUsd(metrics.equity) : "—"} />
      </div>

      {!fresh && (
        <p className="text-[10.5px] text-warn">
          {quote ? "Quote is stale — orders disabled until the feed recovers." : "Waiting for a live quote — orders disabled."}
        </p>
      )}
      {error && <p className="text-[10.5px] text-down">{error}</p>}

      <Button variant={long ? "buy" : "sell"} size="lg" disabled={!canSubmit} onClick={submit}>
        {long ? "Buy / Long" : "Sell / Short"} {inst.base} · Paper
      </Button>

      {result && (
        <p className={cn("text-[10.5px]", result.ok ? "text-up" : "text-down")} role="status">
          {result.text}
        </p>
      )}

      <SectionTitle>Execution model</SectionTitle>
      <ul className="-mt-1 list-disc space-y-0.5 pl-4 text-[10.5px] leading-relaxed text-fg-mute">
        <li>Market fills at best ask (long) / best bid (short).</li>
        <li>SL/TP trigger on the exit side of the book and fill at the observed price (slippage included).</li>
        <li>Fees on entry and exit. No funding, no liquidation, leverage cap {account.leverageCap}×.</li>
      </ul>
    </div>
  );
}
