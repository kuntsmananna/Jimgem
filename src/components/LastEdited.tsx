/**
 * When this row last changed, and who changed it.
 *
 * The quietest line in the popup, at the bottom of it: with two people
 * working the same dashboard this answers "did you touch this?" without
 * anyone having to ask — but it is never what the popup is for, so it sits
 * below the work and reads at half strength.
 *
 * Deliberately not a full timestamp for something changed minutes ago:
 * "today at 14:32" is what a person means, and a date they would have to
 * decode is worse than one they can read.
 */
export function LastEdited({ at, by }: { at: string; by: string }) {
  const when = describe(at);
  if (!when) return null;

  return (
    // On the save row, at its left end, rather than on a line of its own:
    // it is a caption, and a caption should not make a popup taller. The
    // row already reserves this height for the buttons.
    <p className="mr-auto text-[11px] text-ink-soft/60">
      Last edited {when}
      {by ? ` by ${by}` : ""}
    </p>
  );
}

/**
 * Null for a stamp that cannot be read, rather than "Invalid Date": a row
 * from before this was recorded should say nothing at all.
 */
function describe(at: string): string | null {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;

  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return `today at ${time}`;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;

  // Past that, the date itself — with the year only when it isn't this
  // one, which is the same rule the rest of the app follows.
  const sameYear = date.getFullYear() === today.getFullYear();
  const day = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day} at ${time}`;
}
