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

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  /**
   * What is wrong with this field, said next to the field itself.
   *
   * Shown only once a save has actually been attempted — see the expense
   * form. A form that marks a field red before anybody has tried to submit
   * it is telling someone off for not having finished typing yet.
   *
   * The label turns with it rather than only a message appearing below:
   * the label is what is being scanned when you go back to look for what
   * is missing, and one red word is faster to find than one red sentence.
   */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className={`text-xs font-semibold ${error ? "text-red-700" : "text-ink-soft"}`}>
        {label}
      </span>
      {children}
      {error && (
        <span className="text-[11px] font-semibold text-red-700" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
