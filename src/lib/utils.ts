import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parses a user-entered decimal string. Returns null for empty / invalid / non-finite input. */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  if (!/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Rounds DOWN (toward zero) to a number of decimals; used for order sizes so risk never exceeds budget. */
export function floorTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // The epsilon guards against binary artefacts such as 0.3 / 0.1 = 2.9999999999999996.
  return Math.trunc(value * f + Math.sign(value) * 1e-9) / f;
}

export function newId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}
