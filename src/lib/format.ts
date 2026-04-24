// Locale-locked formatting helpers.
//
// Why: BioStat Quest is positioned as an English-language product for
// international academic instructors. JS's default toLocaleString() reads
// navigator.language and gives every viewer a different rendering — a
// Turkish-locale browser shows 1697 as "1.697" (which English readers parse
// as 1.697, not 1,697). Pin everything to en-US so the product looks the
// same everywhere.
//
// Use these instead of `.toLocaleString()` or `.toLocaleDateString()`
// anywhere user-facing. Only callers who explicitly want the visitor's
// locale (e.g. user-input parsing) should bypass.

const NUMBER = new Intl.NumberFormat("en-US");

const DATE_SHORT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const DATE_MD = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const DATETIME = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

// Coerce common input shapes (Date | string | number | null | undefined)
// to a Date, returning null when the input can't be parsed. Callers render
// "—" for null inputs.
function toDate(d: Date | string | number | null | undefined): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Locale-locked thousands grouping. `1697` → `"1,697"`. */
export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return NUMBER.format(n);
}

/** Short date: `"Apr 23, 2026"`. Returns `"—"` for unparseable input. */
export function fmtDate(d: Date | string | number | null | undefined): string {
  const dt = toDate(d);
  return dt ? DATE_SHORT.format(dt) : "—";
}

/** Compact date (no year): `"Apr 23"`. For "last active" columns where the year is implied. */
export function fmtDateMD(d: Date | string | number | null | undefined): string {
  const dt = toDate(d);
  return dt ? DATE_MD.format(dt) : "—";
}

/** Date + time: `"Apr 23, 2026, 2:15 PM"`. Used in admin views. */
export function fmtDateTime(d: Date | string | number | null | undefined): string {
  const dt = toDate(d);
  return dt ? DATETIME.format(dt) : "—";
}

/** Time only: `"2:15 PM"`. */
export function fmtTime(d: Date | string | number | null | undefined): string {
  const dt = toDate(d);
  return dt ? TIME.format(dt) : "—";
}
