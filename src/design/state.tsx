// Loading / empty / error / spinner primitives. One file because they're
// closely related and each is small.
//
// Pattern: any component that reads from the network should explicitly
// handle three states (loading, empty, error) using these primitives.
// Returning `null` while loading silently is a Phase-4-deprecated
// pattern; the rule lives in src/design/README.md.

import * as React from "react";
import { Btn } from "./Btn";
import { Card } from "./Card";

// ---------------------------------------------------------------------------
// InlineSpinner — small loading affordance for buttons and inline text.
// ---------------------------------------------------------------------------
export function InlineSpinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-slate-500 border-t-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton — placeholder block for content-loading states.
// ---------------------------------------------------------------------------
export type SkeletonProps = {
  /** Tailwind width classes — pass "w-full" for fluid, "w-32" etc. for fixed. */
  width?: string;
  /** Tailwind height classes. Defaults to a single text-line height. */
  height?: string;
  className?: string;
};
export function Skeleton({ width = "w-full", height = "h-4", className = "" }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`${width} ${height} rounded bg-slate-800/60 animate-pulse ${className}`}
    />
  );
}

/** Multi-line skeleton helper: stacked rows with fading widths. */
export function SkeletonLines({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-3/4", "w-2/3"];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — "you have no X yet, here's how to get started" block.
// ---------------------------------------------------------------------------
export type EmptyStateProps = {
  /** Optional icon shown above the title. */
  icon?: React.ReactNode;
  title: string;
  /** Optional descriptive paragraph. */
  body?: React.ReactNode;
  /** Optional CTA — typically a button. */
  cta?: React.ReactNode;
  className?: string;
};
export function EmptyState({ icon, title, body, cta, className = "" }: EmptyStateProps) {
  return (
    <Card padding="lg" className={`text-center ${className}`}>
      {icon && <div className="inline-flex items-center justify-center mb-4 text-slate-400">{icon}</div>}
      <div className="text-slate-200 font-semibold mb-2">{title}</div>
      {body && <div className="text-sm text-slate-400 mb-4">{body}</div>}
      {cta && <div className="mt-4">{cta}</div>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ErrorBanner — inline error surface for form validation, network errors.
// ---------------------------------------------------------------------------
export type ErrorBannerProps = {
  /** The user-visible error message. */
  message: string;
  /** Optional retry callback. Renders a button when provided. */
  onRetry?: () => void;
  className?: string;
};
export function ErrorBanner({ message, onRetry, className = "" }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-3 rounded-lg border ${className}`}
      style={{ background: "var(--err-tint)", borderColor: "var(--err-line)", color: "var(--err)" }}
    >
      <div className="flex-1 text-xs leading-relaxed">{message}</div>
      {onRetry && (
        <Btn variant="ghost" size="xs" onClick={onRetry}>
          Try again
        </Btn>
      )}
    </div>
  );
}
