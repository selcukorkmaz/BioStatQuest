# BioStat Quest Design System

Tiny, typed primitives + a token layer. Designed for a solo-dev codebase
that already has Tailwind + a small CSS layer in `styles-legacy.css` —
the goal isn't to replace those, it's to stop reinventing chips, cards,
and state surfaces every time a new view ships.

## Two layers, in sync

1. **CSS custom properties** in `src/styles-legacy.css` (`--accent`,
   `--warn`, `--warn-tint`, `--ok-line`, etc.) — used by Tailwind utilities
   and inline styles that don't have a primitive yet.
2. **TypeScript constants** in `src/design/tokens.ts` (`colors.warnTint`,
   `toneStyle("warn")`, etc.) — used by React primitives and any inline
   style needing a value at JS runtime.

If you add a token here, **add it to both layers**.

## Primitives

All importable from `src/design`:

| Primitive | Use |
|---|---|
| `<Card padding border radius>` | The bordered/blurred panel from `.card`. Use `border="left-warn"` for accent banners. |
| `<Btn variant size busy>` | Wraps `.btn / .btn-primary / .btn-ghost / .btn-gold`. Use `busy` instead of swapping disabled+label by hand. |
| `<Chip tone size leading>` | Replaces every `<span className="chip" style={{background:"rgba(...)"}}>` pattern. Tone is one of: `neutral, info, warn, ok, err`. |
| `<SectionLabel tone count>` | The `text-[10px] uppercase tracking-widest` panel header that titles every card section. |
| `<Stat label value tone>` | Label + mono number cluster. Auto-formats numbers via `fmtNumber`. |
| `<Field label required hint error>` | The label-above-input pattern for forms. Renders required asterisk and inline hint/error. |
| `<Skeleton />`, `<SkeletonLines rows>` | Loading placeholders. Use these instead of returning `null` while data loads. |
| `<EmptyState icon title body cta>` | "You have no X yet — here's how to get started" panel. |
| `<ErrorBanner message onRetry>` | Inline error with optional retry button. |
| `<InlineSpinner size>` | Tiny spinner for buttons / inline progress. |

## Rules

1. **Never inline `rgba(...)` into `style={{...}}`.** Use a primitive
   (`<Chip tone="warn">`) or a CSS variable (`style={{ background: "var(--warn-tint)" }}`).
   The CI guard `scripts/check-no-inline-rgba.sh` enforces this for new
   files; existing files are baselined and migrate as they're touched.

2. **Read from network → handle three states explicitly.** Loading,
   empty, error. Returning `null` while loading is the deprecated pattern.
   Use `<Skeleton/>` for loading, `<EmptyState/>` for "no data," and
   `<ErrorBanner/>` for failures.

3. **No new `@ts-nocheck` files.** The `scripts/check-no-new-tsnocheck.sh`
   guard catches these. Existing files migrate one PR at a time.

4. **One source of truth for state colors.** If you find yourself
   needing a sixth tone, add it to `Tone` in `tokens.ts` AND
   `--<name>-tint/-line` in `styles-legacy.css`. Don't paste a one-off
   hex into a component.

## Tone semantics

| Tone | When to use | Anchor color |
|---|---|---|
| `neutral` | Status that's neither good nor bad ("Archived", "Read-only") | slate-400 |
| `info` | Contextual labels ("Class invite", "Beta") | violet-300 |
| `warn` | Soft attention ("Lapsed", "Not sharing", "Coming soon") | amber-400 |
| `ok` | Success / positive confirmation ("Joined", "Synced") | emerald-500 |
| `err` | Failure / destructive ("Remove", "Failed") | red-500 |

## When NOT to add a primitive

- A one-off layout that won't be repeated. Use Tailwind directly.
- Anything that requires more than 3 props to differentiate variants —
  the "primitive" is doing too much. Split it.

## Adding a new primitive

1. New file under `src/design/` with named export.
2. Re-export from `src/design/index.ts` (the barrel).
3. Type the props strictly. No `any`.
4. Add a one-line description to the table above.
