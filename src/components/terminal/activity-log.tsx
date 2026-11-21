"use client";

import { fmtUtcTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePaperStore } from "@/store/paper-store";

const TONE = {
  fill: "text-accent",
  close: "text-fg",
  reject: "text-down",
  info: "text-fg-dim",
} as const;

/** Session log of simulated fills, closes (incl. SL/TP triggers) and rejections. */
export function ActivityLog() {
  const events = usePaperStore((s) => s.events);
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-line">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="panel-title">Paper activity</span>
        <span className="text-[10px] text-fg-mute">this session</span>
      </div>
      {events.length === 0 ? (
        <p className="px-3 py-3 text-[10.5px] text-fg-mute">Simulated fills, stop/target triggers and rejections appear here.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2 px-3 py-0.5 text-[10.5px] leading-snug">
              <span className="num shrink-0 text-fg-mute">{fmtUtcTime(e.at)}</span>
              <span className={cn("min-w-0 break-words", TONE[e.kind])}>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
