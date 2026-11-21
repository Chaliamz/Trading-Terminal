"use client";

import { useState } from "react";
import { Download, RotateCcw, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { accountMetrics, exitPriceFor, unrealizedPnl, type ClosedTrade, type Position } from "@/lib/paper/engine";
import { fmtDuration, fmtNum, fmtPct, fmtPrice, fmtR, fmtSignedUsd, fmtUsd, fmtUtcDateTime } from "@/lib/format";
import { cn, parseDecimal } from "@/lib/utils";
import { currentFreshQuotes, getInstrument, useMarkQuotes } from "@/hooks/use-market";
import { usePaperStore } from "@/store/paper-store";
import { useUiStore, type BottomTab } from "@/store/ui-store";

export function BottomPanel() {
  const tab = useUiStore((s) => s.bottomTab);
  const setTab = useUiStore((s) => s.setBottomTab);
  const positions = usePaperStore((s) => s.account.positions.length);
  const trades = usePaperStore((s) => s.account.trades.length);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as BottomTab)} className="h-full">
      <div className="flex items-stretch border-b border-line">
        <TabsList className="border-b-0">
          <TabsTrigger value="positions">
            Positions <span className="num text-fg-mute">{positions}</span>
          </TabsTrigger>
          <TabsTrigger value="journal">
            Journal <span className="num text-fg-mute">{trades}</span>
          </TabsTrigger>
        </TabsList>
        <AccountStrip />
      </div>
      <TabsContent value="positions" className="overflow-auto">
        <PositionsTable />
      </TabsContent>
      <TabsContent value="journal" className="overflow-auto">
        <JournalTable />
      </TabsContent>
    </Tabs>
  );
}

function AccountStrip() {
  const account = usePaperStore((s) => s.account);
  const hydrated = usePaperStore((s) => s.hydrated);
  const reset = usePaperStore((s) => s.reset);
  const setFeeRate = usePaperStore((s) => s.setFeeRate);
  const setLeverageCap = usePaperStore((s) => s.setLeverageCap);
  const quotes = useMarkQuotes();
  const [confirmReset, setConfirmReset] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const m = accountMetrics(account, quotes);

  if (!hydrated) return <div className="ml-auto px-3 text-[10.5px] text-fg-mute self-center">Loading paper account…</div>;

  const ret = m.equity / account.startingBalance - 1;
  return (
    <div className="relative ml-auto flex items-center gap-4 overflow-x-auto px-3 text-[10.5px] whitespace-nowrap">
      <Badge variant="warn">Simulated</Badge>
      <Metric label="Equity" value={fmtUsd(m.equity)} tone={ret >= 0 ? "up" : "down"} extra={fmtPct(ret)} />
      <Metric label="Balance" value={fmtUsd(m.balance)} />
      <Metric label="uPnL" value={fmtSignedUsd(m.unrealized)} tone={m.unrealized >= 0 ? "up" : "down"} />
      <Metric label="Realised" value={fmtSignedUsd(m.realizedPnl)} tone={m.realizedPnl >= 0 ? "up" : "down"} />
      <Metric label="Win rate" value={m.winRate == null ? "—" : fmtPct(m.winRate, 0, false)} />
      <Metric label="Avg R" value={fmtR(m.avgR)} />
      <Button variant="ghost" size="xs" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
        Settings
      </Button>
      {confirmReset ? (
        <span className="flex items-center gap-1">
          <Button
            variant="destructive"
            size="xs"
            onClick={() => {
              reset();
              setConfirmReset(false);
            }}
          >
            Confirm reset to $10,000
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={() => setConfirmReset(false)} aria-label="Cancel reset">
            <X />
          </Button>
        </span>
      ) : (
        <Button variant="ghost" size="xs" onClick={() => setConfirmReset(true)}>
          <RotateCcw /> Reset
        </Button>
      )}
      {settingsOpen && (
        <SettingsPopover
          feeRate={account.feeRate}
          leverageCap={account.leverageCap}
          onFee={setFeeRate}
          onLev={setLeverageCap}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function SettingsPopover({
  feeRate,
  leverageCap,
  onFee,
  onLev,
  onClose,
}: {
  feeRate: number;
  leverageCap: number;
  onFee: (v: number) => void;
  onLev: (v: number) => void;
  onClose: () => void;
}) {
  const [fee, setFee] = useState(String(+(feeRate * 100).toFixed(4)));
  const [lev, setLev] = useState(String(leverageCap));
  const feeN = parseDecimal(fee);
  const levN = parseDecimal(lev);
  const feeOk = feeN != null && feeN >= 0 && feeN < 5;
  const levOk = levN != null && levN >= 1 && levN <= 50;
  return (
    <div className="fixed right-3 bottom-8 z-40 w-64 rounded-md border border-line-strong bg-popover p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-title">Simulation settings</span>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close settings">
          <X />
        </Button>
      </div>
      <label className="mb-1 block text-[11px] text-fg-dim" htmlFor="set-fee">
        Taker fee per side (%)
      </label>
      <Input id="set-fee" value={fee} onChange={(e) => setFee(e.target.value)} aria-invalid={!feeOk || undefined} />
      <label className="mt-2 mb-1 block text-[11px] text-fg-dim" htmlFor="set-lev">
        Leverage cap (×)
      </label>
      <Input id="set-lev" value={lev} onChange={(e) => setLev(e.target.value)} aria-invalid={!levOk || undefined} />
      <p className="mt-2 text-[10px] leading-relaxed text-fg-mute">
        Default fee 0.045% is an assumption for Hyperliquid&apos;s base taker tier — set your own tier.
      </p>
      <Button
        className="mt-2 w-full"
        size="sm"
        disabled={!feeOk || !levOk}
        onClick={() => {
          onFee(feeN! / 100);
          onLev(levN!);
          onClose();
        }}
      >
        Apply
      </Button>
    </div>
  );
}

function Metric({ label, value, tone, extra }: { label: string; value: string; tone?: "up" | "down"; extra?: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-fg-mute">{label}</span>
      <span className={cn("num text-fg", tone === "up" && "text-up", tone === "down" && "text-down")}>{value}</span>
      {extra && <span className={cn("num", tone === "up" ? "text-up" : "text-down")}>{extra}</span>}
    </span>
  );
}

const TH = "px-2 py-1.5 text-left font-medium text-fg-mute whitespace-nowrap";
const TD = "px-2 py-1 whitespace-nowrap";

function PositionsTable() {
  const positions = usePaperStore((s) => s.account.positions);
  const hydrated = usePaperStore((s) => s.hydrated);
  const quotes = useMarkQuotes();

  if (!hydrated) return <Empty text="Loading…" />;
  if (positions.length === 0)
    return <Empty text="No open paper positions. Use the Order tab (or Risk → Send to ticket) to open one." />;

  return (
    <table className="w-full text-[11px]">
      <thead className="sticky top-0 bg-panel">
        <tr className="border-b border-line">
          <th className={TH}>Market</th>
          <th className={TH}>Side</th>
          <th className={cn(TH, "text-right")}>Size</th>
          <th className={cn(TH, "text-right")}>Entry</th>
          <th className={cn(TH, "text-right")}>Mark (exit)</th>
          <th className={cn(TH, "text-right")}>uPnL</th>
          <th className={cn(TH, "text-right")}>R</th>
          <th className={TH}>Stop-loss</th>
          <th className={TH}>Take-profit</th>
          <th className={TH}>Opened (UTC)</th>
          <th className={TH} />
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => (
          <PositionRow key={p.id} p={p} quote={quotes[p.symbol]} />
        ))}
      </tbody>
    </table>
  );
}

function PositionRow({ p, quote }: { p: Position; quote: { bid: number; ask: number; time: number } | undefined }) {
  const inst = getInstrument(p.symbol);
  const close = usePaperStore((s) => s.close);
  const setProtection = usePaperStore((s) => s.setProtection);
  const setActiveSymbol = useUiStore((s) => s.setActiveSymbol);
  const [msg, setMsg] = useState<string | null>(null);
  const u = unrealizedPnl(p, quote);
  const r = u != null && p.initialRisk ? u / p.initialRisk : null;
  const pct = u != null ? u / (p.entryPrice * p.size) : null;

  const onClose = () => {
    const res = close(p.id, currentFreshQuotes());
    if (!res.ok) setMsg(res.message);
  };
  const saveProt = (sl: number | null, tp: number | null) => {
    const res = setProtection(p.id, sl, tp, currentFreshQuotes());
    setMsg(res.ok ? null : res.message);
    return res.ok;
  };

  return (
    <tr className="border-b border-line/60 hover:bg-panel-2">
      <td className={TD}>
        <button type="button" className="cursor-pointer font-semibold text-fg hover:text-accent" onClick={() => setActiveSymbol(p.symbol)}>
          {inst.display}
        </button>
      </td>
      <td className={TD}>
        <Badge variant={p.side === "long" ? "up" : "down"}>{p.side}</Badge>
      </td>
      <td className={cn(TD, "num text-right")}>{fmtNum(p.size, inst.szDecimals)}</td>
      <td className={cn(TD, "num text-right")}>{fmtPrice(p.entryPrice, inst.pxDecimals)}</td>
      <td className={cn(TD, "num text-right")}>{quote ? fmtPrice(exitPriceFor(p.side, quote), inst.pxDecimals) : "—"}</td>
      <td className={cn(TD, "num text-right", u == null ? "" : u >= 0 ? "text-up" : "text-down")}>
        {fmtSignedUsd(u)} <span className="text-[10px] opacity-80">{fmtPct(pct)}</span>
      </td>
      <td className={cn(TD, "num text-right", r == null ? "text-fg-mute" : r >= 0 ? "text-up" : "text-down")}>{fmtR(r)}</td>
      <td className={TD}>
        <PriceCell value={p.stopLoss} onSave={(v) => saveProt(v, p.takeProfit)} decimals={inst.pxDecimals} />
      </td>
      <td className={TD}>
        <PriceCell value={p.takeProfit} onSave={(v) => saveProt(p.stopLoss, v)} decimals={inst.pxDecimals} />
      </td>
      <td className={cn(TD, "num text-fg-dim")}>{fmtUtcDateTime(p.openedAt)}</td>
      <td className={cn(TD, "text-right")}>
        <div className="flex items-center justify-end gap-2">
          {msg && <span className="max-w-56 truncate text-[10px] text-down" title={msg}>{msg}</span>}
          <Button variant="secondary" size="xs" onClick={onClose}>
            Close
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** Inline editable price; empty clears the order. Commits on Enter or blur. */
function PriceCell({ value, onSave, decimals }: { value: number | null; onSave: (v: number | null) => boolean; decimals: number }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (!editing) {
    return (
      <button
        type="button"
        className={cn("num cursor-pointer rounded px-1 hover:bg-panel-3", value == null ? "text-fg-mute" : "text-fg")}
        onClick={() => {
          setText(value == null ? "" : String(value));
          setEditing(true);
        }}
        title="Click to edit"
      >
        {value == null ? "+ add" : fmtPrice(value, decimals)}
      </button>
    );
  }
  /** Returns true when the edit was saved. */
  const commit = () => {
    const v = text.trim() === "" ? null : parseDecimal(text);
    if (text.trim() !== "" && v == null) return false;
    if (v === value) return true;
    return onSave(v);
  };
  return (
    <Input
      autoFocus
      className="h-6 w-24"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && commit()) setEditing(false);
        if (e.key === "Escape") setEditing(false);
      }}
      onBlur={() => {
        commit();
        setEditing(false);
      }}
      placeholder="none"
    />
  );
}

function JournalTable() {
  const trades = usePaperStore((s) => s.account.trades);
  const hydrated = usePaperStore((s) => s.hydrated);
  if (!hydrated) return <Empty text="Loading…" />;
  if (trades.length === 0) return <Empty text="No closed trades yet. Closed paper trades are journalled here automatically." />;

  return (
    <div>
      <div className="flex justify-end px-2 pt-1">
        <Button variant="ghost" size="xs" onClick={() => exportCsv(trades)}>
          <Download /> Export CSV
        </Button>
      </div>
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-panel">
          <tr className="border-b border-line">
            <th className={TH}>Closed (UTC)</th>
            <th className={TH}>Market</th>
            <th className={TH}>Side</th>
            <th className={cn(TH, "text-right")}>Size</th>
            <th className={cn(TH, "text-right")}>Entry</th>
            <th className={cn(TH, "text-right")}>Exit</th>
            <th className={cn(TH, "text-right")}>Net PnL</th>
            <th className={cn(TH, "text-right")}>Fees</th>
            <th className={cn(TH, "text-right")}>R</th>
            <th className={TH}>Exit reason</th>
            <th className={TH}>Held</th>
            <th className={TH}>Note</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => (
            <JournalRow key={t.id} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JournalRow({ t }: { t: ClosedTrade }) {
  const inst = getInstrument(t.symbol);
  const setNote = usePaperStore((s) => s.setTradeNote);
  const [note, setLocalNote] = useState(t.note);
  return (
    <tr className="border-b border-line/60 hover:bg-panel-2">
      <td className={cn(TD, "num text-fg-dim")}>{fmtUtcDateTime(t.closedAt)}</td>
      <td className={cn(TD, "font-semibold")}>{inst.display}</td>
      <td className={TD}>
        <Badge variant={t.side === "long" ? "up" : "down"}>{t.side}</Badge>
      </td>
      <td className={cn(TD, "num text-right")}>{fmtNum(t.size, inst.szDecimals)}</td>
      <td className={cn(TD, "num text-right")}>{fmtPrice(t.entryPrice, inst.pxDecimals)}</td>
      <td className={cn(TD, "num text-right")}>{fmtPrice(t.exitPrice, inst.pxDecimals)}</td>
      <td className={cn(TD, "num text-right", t.netPnl >= 0 ? "text-up" : "text-down")}>{fmtSignedUsd(t.netPnl)}</td>
      <td className={cn(TD, "num text-right text-fg-dim")}>{fmtUsd(t.fees)}</td>
      <td className={cn(TD, "num text-right", t.rMultiple == null ? "text-fg-mute" : t.rMultiple >= 0 ? "text-up" : "text-down")}>
        {fmtR(t.rMultiple)}
      </td>
      <td className={TD}>
        <Badge variant={t.reason === "take-profit" ? "up" : t.reason === "stop-loss" ? "down" : "muted"}>{t.reason}</Badge>
      </td>
      <td className={cn(TD, "num text-fg-dim")}>{fmtDuration(t.closedAt - t.openedAt)}</td>
      <td className={TD}>
        <Input
          className="h-6 w-48 font-sans"
          value={note}
          placeholder="Add note…"
          onChange={(e) => setLocalNote(e.target.value)}
          onBlur={() => note !== t.note && setNote(t.id, note)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </td>
    </tr>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-[11px] text-fg-mute">{text}</div>;
}

function exportCsv(trades: ClosedTrade[]) {
  const cols: Array<keyof ClosedTrade> = [
    "id", "symbol", "side", "size", "entryPrice", "exitPrice", "openedAt", "closedAt",
    "grossPnl", "fees", "netPnl", "rMultiple", "reason", "stopLoss", "takeProfit", "note",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = trades.map((t) =>
    cols.map((c) => (c === "openedAt" || c === "closedAt" ? new Date(t[c] as number).toISOString() : esc(t[c]))).join(","),
  );
  const blob = new Blob([[cols.join(","), ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apex-paper-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
