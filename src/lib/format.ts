const usdCache = new Map<string, Intl.NumberFormat>();

function nf(min: number, max: number, extra?: Intl.NumberFormatOptions) {
  const key = `${min}:${max}:${JSON.stringify(extra ?? {})}`;
  let f = usdCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max, ...extra });
    usdCache.set(key, f);
  }
  return f;
}

const DASH = "—";

export function fmtPrice(v: number | null | undefined, decimals: number): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return nf(decimals, decimals).format(v);
}

export function fmtUsd(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const s = nf(decimals, decimals).format(Math.abs(v));
  return `${v < 0 ? "-" : ""}$${s}`;
}

export function fmtSignedUsd(v: number | null | undefined, decimals = 2): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const s = nf(decimals, decimals).format(Math.abs(v));
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}$${s}`;
}

export function fmtPct(v: number | null | undefined, decimals = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  const s = nf(decimals, decimals).format(Math.abs(v * 100));
  const sign = signed ? (v > 0 ? "+" : v < 0 ? "-" : "") : v < 0 ? "-" : "";
  return `${sign}${s}%`;
}

export function fmtNum(v: number | null | undefined, decimals: number): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return nf(0, decimals).format(v);
}

export function fmtCompactUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `$${nf(0, 2, { notation: "compact" }).format(v)}`;
}

export function fmtR(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return DASH;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}

export function fmtUtcTime(ms: number, withSeconds = true): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${withSeconds ? `:${p(d.getUTCSeconds())}` : ""}`;
}

export function fmtUtcDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${fmtUtcTime(ms, false)}`;
}

export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return DASH;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p(h)}:${p(m)}:${p(sec)}`;
  if (h > 0) return `${h}:${p(m)}:${p(sec)}`;
  return `${p(m)}:${p(sec)}`;
}
