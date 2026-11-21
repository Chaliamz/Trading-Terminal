"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  tone,
  className,
  title,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down" | "accent" | "warn" | "dim";
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-2 py-[3px]", className)} title={title}>
      <span className="text-[11px] text-fg-mute">{label}</span>
      <span
        className={cn(
          "num text-right text-[11.5px] text-fg",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
          tone === "accent" && "text-accent",
          tone === "warn" && "text-warn",
          tone === "dim" && "text-fg-dim",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function NumField({
  id,
  label,
  value,
  onChange,
  suffix,
  invalid,
  placeholder,
  action,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  invalid?: boolean;
  placeholder?: string;
  action?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(suffix && "pr-10")}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-fg-mute">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function MiniAction({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer text-[10px] font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-fg-mute disabled:no-underline"
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pt-1 pb-1.5">
      <span className="panel-title">{children}</span>
      {right}
    </div>
  );
}
