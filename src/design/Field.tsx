// <Field label="Email" required hint="we'll send the code here">
//   <input ... />
// </Field>
//
// The label-above-input pattern from every form in the app. Renders the
// uppercase eyebrow label, asterisk for required, and an optional hint
// or character count below.

import * as React from "react";

export type FieldProps = {
  label: string;
  required?: boolean;
  /** Helper text under the input. */
  hint?: string;
  /** Inline error message. Replaces hint visually when present. */
  error?: string;
  className?: string;
  children: React.ReactNode;
};

export function Field({ label, required, hint, error, className = "", children }: FieldProps) {
  return (
    <label className={`block ${className}`}>
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-1" aria-hidden>*</span>}
      </div>
      {children}
      {(error || hint) && (
        <div className={`mt-1 text-[11px] ${error ? "text-red-400" : "text-slate-500"}`}>
          {error || hint}
        </div>
      )}
    </label>
  );
}
