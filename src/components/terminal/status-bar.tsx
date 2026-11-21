"use client";

import { RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getMarketAdapter } from "@/lib/market/provider";
import { fmtUtcTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useServerNow } from "@/hooks/use-market";
import { useMarketStore } from "@/store/market-store";
import type { FeedStatus } from "@/lib/market/types";

const STATUS_META: Record<FeedStatus, { label: string; dot: string; text: string }> = {
  idle: { label: "IDLE", dot: "bg-fg-mute", text: "text-fg-mute" },
  connecting: { label: "CONNECTING", dot: "bg-warn animate-pulse", text: "text-warn" },
  live: { label: "LIVE", dot: "bg-up", text: "text-up" },
  reconnecting: { label: "RECONNECTING", dot: "bg-warn animate-pulse", text: "text-warn" },
  stale: { label: "STALE", dot: "bg-warn", text: "text-warn" },
  error: { label: "ERROR", dot: "bg-down", text: "text-down" },
};

export function StatusBar() {
  const status = useMarketStore((s) => s.feedStatus);
  const detail = useMarketStore((s) => s.feedDetail);
  const lastMessageAt = useMarketStore((s) => s.lastMessageAt);
  const offset = useMarketStore((s) => s.clockOffsetMs);
  const invalid = useMarketStore((s) => s.invalidMessages);
  const serverNow = useServerNow(1000);
  const meta = STATUS_META[status];
  const localNow = serverNow != null ? serverNow - (offset ?? 0) : null;
  const age = lastMessageAt != null && localNow != null ? Math.max(0, localNow - lastMessageAt) : null;

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-panel px-3 text-[10px] text-fg-mute">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("flex items-center gap-1.5 font-semibold tracking-wider", meta.text)}>
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{detail ?? "Hyperliquid WebSocket feed status"}</TooltipContent>
      </Tooltip>
      {detail && status !== "live" && <span className="hidden truncate text-fg-dim md:inline">{detail}</span>}
      <span className="num">Last tick {age == null ? "—" : `${(age / 1000).toFixed(1)}s ago`}</span>
      <span className="num hidden sm:inline">
        Clock offset {offset == null ? "syncing…" : `${offset >= 0 ? "+" : ""}${offset}ms`}
      </span>
      {invalid > 0 && <span className="text-warn">{invalid} invalid msgs dropped</span>}
      <button
        type="button"
        onClick={() => getMarketAdapter().reconnect()}
        className="flex cursor-pointer items-center gap-1 hover:text-fg"
      >
        <RefreshCw className="size-3" /> Reconnect
      </button>
      <span className="ml-auto hidden text-fg-mute md:inline">Data: Hyperliquid public API · No exchange execution</span>
      <span className="num text-fg-dim">{serverNow == null ? "--:--:--" : fmtUtcTime(serverNow)} UTC</span>
    </footer>
  );
}
