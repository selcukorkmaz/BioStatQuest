// <Btn variant="primary" size="md" disabled busy>Send invite</Btn>
//
// Wraps the .btn / .btn-primary / .btn-ghost / .btn-gold CSS classes from
// styles-legacy.css with a typed variant scale and a `busy` shim that
// disables + swaps the label. Replaces the dozens of bespoke
// `className="btn btn-primary px-5 py-2.5 rounded-xl text-sm"` strings
// across the codebase.

import * as React from "react";

export type BtnProps = {
  variant?: "primary" | "ghost" | "gold" | "danger";
  size?: "xs" | "sm" | "md" | "lg";
  /** Renders disabled + replaces children with a busy label (or default "Working…"). */
  busy?: boolean;
  busyLabel?: string;
  /** Type defaults to "button" so the primitive doesn't accidentally submit forms. */
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: React.MouseEventHandler;
  className?: string;
  /** Render as an anchor instead of a button (e.g. for navigation links styled like buttons). */
  as?: "button" | "a";
  href?: string;
  title?: string;
  children: React.ReactNode;
};

const SIZE: Record<NonNullable<BtnProps["size"]>, string> = {
  xs: "px-2.5 py-1 text-[11px] rounded-md",
  sm: "px-4 py-2 text-xs rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-8 py-3 text-base rounded-xl",
};

const VARIANT: Record<NonNullable<BtnProps["variant"]>, string> = {
  primary: "btn btn-primary",
  ghost: "btn btn-ghost",
  gold: "btn btn-gold",
  // Danger doesn't have a CSS class today; build it inline using err tokens.
  // Kept here so future refactors can move all four variants to .btn-danger.
  danger: "btn",
};

export function Btn({
  variant = "primary",
  size = "md",
  busy = false,
  busyLabel,
  type = "button",
  disabled,
  onClick,
  className = "",
  as = "button",
  href,
  title,
  children,
}: BtnProps) {
  const isDisabled = disabled || busy;
  const cls = `${VARIANT[variant]} ${SIZE[size]} whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${className}`;
  const dangerStyle = variant === "danger"
    ? { background: "var(--err)", color: "#fff" }
    : undefined;
  const label = busy ? (busyLabel || "Working…") : children;

  if (as === "a") {
    return (
      <a
        href={href}
        title={title}
        onClick={isDisabled ? (e) => e.preventDefault() : onClick}
        className={cls}
        aria-disabled={isDisabled || undefined}
        style={dangerStyle}
      >
        {label}
      </a>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      className={cls}
      style={dangerStyle}
    >
      {label}
    </button>
  );
}
