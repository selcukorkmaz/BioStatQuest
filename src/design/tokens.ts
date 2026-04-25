// Design tokens — TypeScript mirror of the CSS custom properties defined
// in src/styles-legacy.css. Use these from React when you need a value
// at JS runtime (e.g. inline styles for chart colors, dynamic class
// composition). For static styling, prefer the CSS variables themselves
// (`var(--accent)`) so the cascade can override them.
//
// The two layers MUST stay in sync. If you add a token here, also add
// it to :root in styles-legacy.css. The grep guard in
// scripts/check-no-inline-rgba.sh exists to catch components that bypass
// both layers and inline raw RGBA values.

// ---------- Brand colors (existing) ----------
export const colors = {
  // Primary brand — cyan/teal
  accent: "#22d3ee",
  accentDeep: "#0891b2",
  accentInk: "rgba(34,211,238,0.35)",

  // Secondary — violet
  violet: "#8b5cf6",
  violetInk: "rgba(139,92,246,0.22)",

  // Tertiary — gold (reserved for XP / streak / milestones)
  gold: "#fbbf24",

  // Ink scale — text on dark backgrounds, top→bottom contrast
  ink1: "#f1f5f9", // display / title
  ink2: "#cbd5e1", // body
  ink3: "#94a3b8", // caption
  ink4: "#64748b", // muted

  // Hairline divider
  line: "rgba(148,163,184,0.12)",

  // Backgrounds
  bg0: "#05070f",
  bg1: "#0a0f1e",
  bg2: "#0f1630",

  // ---------- Phase 4: semantic state colors ----------
  // Each state has three values: solid (text/icon), tint (background
  // fill), line (border). Pre-computed RGBA strings so consumers don't
  // re-derive them.
  warn: "#fbbf24",
  warnTint: "rgba(251,191,36,0.10)",
  warnLine: "rgba(251,191,36,0.30)",

  ok: "#10b981",
  okTint: "rgba(16,185,129,0.12)",
  okLine: "rgba(16,185,129,0.30)",

  err: "#ef4444",
  errTint: "rgba(239,68,68,0.10)",
  errLine: "rgba(239,68,68,0.30)",

  info: "#c4b5fd",
  infoTint: "rgba(139,92,246,0.10)",
  infoLine: "rgba(139,92,246,0.25)",

  neutral: "#94a3b8",
  neutralTint: "rgba(148,163,184,0.08)",
  neutralLine: "rgba(148,163,184,0.25)",
} as const;

// ---------- Spacing / radii / typography ----------
// Component primitives in src/design/* read from these so component
// instances stay consistent. All values match Tailwind's defaults so we
// can pair them with utility classes without conflict.
export const radii = {
  sm: "0.375rem", // rounded-md
  md: "0.5rem",   // rounded-lg
  lg: "0.75rem",  // rounded-xl
  xl: "1rem",     // rounded-2xl
  pill: "9999px",
} as const;

export const fontSizes = {
  // Aligned with the .t-* typography classes in styles-legacy.css.
  display: "clamp(2.25rem, 4vw, 3.5rem)",
  title: "clamp(1.5rem, 2.2vw, 2rem)",
  subtitle: "1.125rem",
  body: "0.975rem",
  caption: "0.8125rem",
  eyebrow: "0.6875rem",
} as const;

// State-level type alias used by Chip, Banner, etc. to constrain the
// `tone` prop to known semantic values. New states added here must also
// have matching --warn / --ok / etc. CSS custom properties.
export type Tone = "neutral" | "info" | "warn" | "ok" | "err";

/** Map a Tone to its (tint, line, text) triple — for inline styles in primitives. */
export function toneStyle(tone: Tone): { background: string; borderColor: string; color: string } {
  switch (tone) {
    case "info":    return { background: colors.infoTint,    borderColor: colors.infoLine,    color: colors.info };
    case "warn":    return { background: colors.warnTint,    borderColor: colors.warnLine,    color: colors.warn };
    case "ok":      return { background: colors.okTint,      borderColor: colors.okLine,      color: colors.ok };
    case "err":     return { background: colors.errTint,     borderColor: colors.errLine,     color: colors.err };
    case "neutral":
    default:        return { background: colors.neutralTint, borderColor: colors.neutralLine, color: colors.neutral };
  }
}
