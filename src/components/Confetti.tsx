// @ts-nocheck
// Shared confetti burst. Driven by the `.confetti-piece` CSS keyframes in
// index.css. Used by auth success, milestone case completions, and anywhere
// a small celebration is warranted. No props beyond `count`.
import * as React from "react";

export function Confetti({ count = 80 }) {
  const colors = ["#8b5cf6", "#06b6d4", "#fbbf24", "#10b981", "#ec4899", "#f59e0b"];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const s = {
          left: `${Math.random() * 100}vw`,
          background: colors[i % colors.length],
          animationDelay: `${Math.random() * 0.8}s`,
          animationDuration: `${2 + Math.random() * 1.5}s`,
          borderRadius: Math.random() > 0.5 ? "50%" : "2px",
        };
        return <div key={i} className="confetti-piece" style={s} />;
      })}
    </>
  );
}
