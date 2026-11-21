"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { calcPositionSize, type Side } from "@/lib/risk/position-size";
import { accountMetrics } from "@/lib/paper/engine";
import { fmtNum, fmtPct, fmtPrice, fmtUsd } from "@/lib/format";
import { cn, parseDecimal } from "@/lib/utils";
import { useActiveInstrument, useMarkQuotes, useStructure } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import { usePaperStore } from "@/store/paper-store";
import { useUiStore } from "@/store/ui-store";
import { MiniAction, NumField, SectionTitle, Stat } from "./fields";

const DEFAULT_RISK_PCT = "1";

export function RiskCalculator() {
  const inst = useActiveInstrument();
  const quote = useMarketStore((s) => s.quotes[inst.symbol]);
  const account = usePaperStore((s) => s.account);
  const hydrated = usePaperStore((s) => s.hydrated);
  const markQuotes = useMarkQuotes();
  const structure = useStructure();
  const sendToTicket = useUiStore((s) => s.sendToTicket);

  const [equity, setEquity] = useState("");
  const [riskPct, setRiskPct] = useState(DEFAULT_RISK_PCT);
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [rr, setRr] = useState("2");
  const [includeFees, setIncludeFees] = useState(true);

  const paperEquity = hydrated ? accountMetrics(account, markQuotes).equity : null;
  // Empty equity field means "track paper equity".
  const equityN = equity.trim() === "" ? paperEquity : parseDecimal(equity);
  const entryN = parseDecimal(entry);
  const stopN = parseDecimal(stop);
  const riskN = parseDecimal(riskPct);
  const rrN = parseDecimal(rr);

  const ready = equityN != null && entryN != null && stopN != null && riskN != null && rrN != null;
  const result = ready
    ? calcPositionSize({
        equity: equityN,
        riskPct: riskN,
        entry: entryN,
        stop: stopN,
        rewardMultiple: rrN,
        feeRate: account.feeRate,
        includeFees,
        szDecimals: inst.szDecimals,
      })
    : null;

  const lastSwingLow = structure ? [...structure.swings].reverse().find((s) => s.kind === "low") : undefined;
  const lastSwingHigh = structure ? [...structure.swings].reverse().find((s) => s.kind === "high") : undefined;

  const fillEntry = (side: Side) => {
    if (!quote) return;
    setEntry(String(side === "long" ? quote.ask : quote.bid));
  };

  const send = () => {
    if (!result || !result.ok) return;
    const tpRounded = Number(result.takeProfit.toFixed(inst.pxDecimals));
    sendToTicket({
      symbol: inst.symbol,
      side: result.side,
      size: result.size,
      stopLoss: stopN,
      takeProfit: tpRounded > 0 ? tpRounded : null,
    });
  };

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="grid grid-cols-2 gap-2">
        <NumField
          id="risk-equity"
          label="Account equity"
          value={equity}
          onChange={setEquity}
          suffix="USD"
          placeholder={paperEquity != null ? paperEquity.toFixed(2) : "—"}
          action={
            <MiniAction onClick={() => setEquity("")} disabled={equity === ""}>
              paper
            </MiniAction>
          }
        />
        <NumField
          id="risk-pct"
          label="Risk per trade"
          value={riskPct}
          onChange={setRiskPct}
          suffix="%"
          invalid={riskPct !== "" && (riskN == null || riskN <= 0 || riskN > 100)}
        />
      </div>
      <NumField
        id="risk-entry"
        label="Entry price"
        value={entry}
        onChange={setEntry}
        placeholder={fmtPrice(quote ? (quote.bid + quote.ask) / 2 : null, inst.pxDecimals)}
        action={
          <span className="flex gap-2">
            <MiniAction onClick={() => fillEntry("long")} disabled={!quote}>
              ask
            </MiniAction>
            <MiniAction onClick={() => fillEntry("short")} disabled={!quote}>
              bid
            </MiniAction>
          </span>
        }
      />
      <NumField
        id="risk-stop"
        label="Stop-loss"
        value={stop}
        onChange={setStop}
        action={
          <span className="flex gap-2">
            <MiniAction onClick={() => lastSwingLow && setStop(String(lastSwingLow.price))} disabled={!lastSwingLow}>
              swing low
            </MiniAction>
            <MiniAction onClick={() => lastSwingHigh && setStop(String(lastSwingHigh.price))} disabled={!lastSwingHigh}>
              swing high
            </MiniAction>
          </span>
        }
      />
      <div className="grid grid-cols-2 items-end gap-2">
        <NumField id="risk-rr" label="Target (R multiple)" value={rr} onChange={setRr} suffix="R" />
        <div className="flex h-7 items-center gap-2">
          <Switch id="risk-fees" checked={includeFees} onCheckedChange={setIncludeFees} />
          <Label htmlFor="risk-fees">Budget fees ({fmtPct(account.feeRate, 3, false)})</Label>
        </div>
      </div>

      <SectionTitle>Result</SectionTitle>
      {!ready && <p className="-mt-1 text-[10.5px] text-fg-mute">Enter entry and stop-loss to size the position.</p>}
      {result && !result.ok && <p className="-mt-1 text-[10.5px] text-down">{result.error}</p>}
      {result && result.ok && (
        <>
          <div className="-mt-1 rounded-md border border-line bg-panel-2 px-2.5 py-1.5">
            <Stat
              label="Direction"
              value={result.side === "long" ? "LONG" : "SHORT"}
              tone={result.side === "long" ? "up" : "down"}
            />
            <Stat label="Position size" value={`${fmtNum(result.size, inst.szDecimals)} ${inst.base}`} tone="accent" />
            <Stat label="Notional" value={fmtUsd(result.notional)} />
            <Stat label="Risk budget" value={fmtUsd(result.riskBudget)} />
            <Stat label="Loss at stop" value={fmtUsd(result.riskAtStop)} tone="down" />
            <Stat label="Stop distance" value={`${fmtPrice(result.stopDistance, inst.pxDecimals)} · ${fmtPct(result.stopPct, 2, false)}`} />
            <Stat label="Take-profit" value={fmtPrice(result.takeProfit, inst.pxDecimals)} tone="up" />
            <Stat label="R:R (gross / net)" value={`${result.rr.toFixed(2)} / ${result.netRr.toFixed(2)}`} />
            <Stat
              label="Effective leverage"
              value={`${result.leverage.toFixed(2)}×`}
              tone={result.leverage > 1 ? "warn" : undefined}
            />
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="text-[10.5px] text-warn">
              {w}
            </p>
          ))}
          <Button variant="secondary" onClick={send}>
            <Send /> Send to order ticket
          </Button>
        </>
      )}
      <p className={cn("text-[10px] leading-relaxed text-fg-mute")}>
        Size = equity × risk% ÷ (|entry − stop|{includeFees ? " + round-trip fees" : ""}), floored to{" "}
        {inst.szDecimals} decimals so realised loss at the stop never exceeds the budget.
      </p>
    </div>
  );
}
