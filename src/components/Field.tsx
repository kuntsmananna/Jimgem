"use client";

/**
 * Form field primitives, shared by the order and expense forms.
 *
 * `TextInput` and `SelectInput` exist so the `.input` class and its
 * precondition ship together: the quiet-when-filled styling detects
 * emptiness with `:placeholder-shown`, which needs *some* placeholder
 * attribute to match against (see globals.css). Leaving that to each call
 * site meant remembering `placeholder=" "` on every input, and one had
 * already been missed — that field rendered permanently outlined as
 * though it were empty.
 */

/** `className` is appended to `.input`, never replaces it. */
export function TextInput({ placeholder = " ", className = "", ...props }: React.ComponentProps<"input">) {
  return <input className={`input ${className}`} placeholder={placeholder} {...props} />;
}

export function SelectInput({ className = "", ...props }: React.ComponentProps<"select">) {
  return <select className={`input ${className}`} {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
