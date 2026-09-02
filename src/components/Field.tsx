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

/**
 * Same quiet styling for text that runs to more than a line. Notes carries
 * a description *and* a note joined with " · " (see migration 004), which a
 * single-line input showed a third of.
 *
 * `autoGrow` makes the box follow what is in it, for the case where no
 * layout is handing it a height: on a laptop the order form's notes field
 * takes the full height of the panel from `flex-1`, but in the phone's
 * single column that resolves to the textarea's own two-row intrinsic
 * height and the field shows three lines of a long note. Height is set
 * from `scrollHeight`, which needs the reset to `auto` first or the box
 * can only ever get taller.
 */
export function TextArea({
  placeholder = " ",
  className = "",
  autoGrow = false,
  onChange,
  ...props
}: React.ComponentProps<"textarea"> & { autoGrow?: boolean }) {
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <textarea
      // A ref callback rather than an effect: it fires on mount and on
      // every re-mount, which is when a value arrives from the server, and
      // costs no dependency array to keep in step.
      ref={fit}
      className={`input resize-none ${className}`}
      placeholder={placeholder}
      onChange={(event) => {
        fit(event.currentTarget);
        onChange?.(event);
      }}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
