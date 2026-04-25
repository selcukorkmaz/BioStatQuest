// Minimal focus trap for modals. ~30 lines, no dependency.
//
// Usage:
//   const ref = useFocusTrap<HTMLDivElement>(active, onClose);
//   return <div ref={ref} role="dialog" aria-modal="true">…</div>;
//
// Behavior:
//   • On open: focuses the first focusable element inside the modal,
//     remembering the element that had focus before so we can restore it
//     on close.
//   • Tab cycles within the modal — at the last focusable element, Tab
//     wraps to the first; Shift+Tab at the first wraps to the last.
//   • Esc calls onClose (when provided).
//
// Why not focus-trap-react: 30 lines is cheaper than a new dep + types
// + bundle size. Swap in the library if we ever need iframe handling,
// nested traps, or auto-focus-on-mutation — none apply today.

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onEscape?: () => void
) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember what had focus before the modal opened, so we can
    // restore it when the modal closes (the user's mental model is
    // "I clicked X to open this; close it and I'm back at X").
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
    };

    // Focus the first focusable element on mount. If the container itself
    // has tabIndex -1 (common pattern) we focus it as a fallback so the
    // modal isn't "below" the focus stack.
    const initial = focusables();
    if (initial.length > 0) {
      initial[0].focus();
    } else if (container.tabIndex >= 0) {
      container.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      // Restore focus to the opener so keyboard users land back where
      // they were. Wrap in a try because the previously-focused element
      // may have been removed from the DOM while the modal was open.
      try { previouslyFocused?.focus(); } catch { /* element gone */ }
    };
  }, [active, onEscape]);

  return containerRef;
}
