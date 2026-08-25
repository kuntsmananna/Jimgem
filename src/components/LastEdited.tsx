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
  const when = whenText(at);
  if (!when) return null;

  return (
    // On the save row rather than on a line of its own: it is a caption,
    // and a caption should not make a popup taller — that row already
    // reserves the height. Where it sits in the row is the row's business,
    // so no margin of its own: it renders nothing for an unstamped row,
    // and a spacer that disappeared with it would move the buttons.
    <p className="text-[11px] text-ink-soft/60">
      Last edited {when}
      {by ? ` by ${by}` : ""}
    </p>
  );
}

/**
 * When something happened, as a person would say it.
 *
 * Exported because it is the app's one answer to that: the Settings
 * panes that list backups and recent changes ask the same question about
 * the same kind of stamp, and a bare `Intl` format there would print
 * "25 Aug, 14:32" for something that happened ten minutes ago while the
 * popup for that very row says "today at 14:32".
 *
 * Null for a stamp that cannot be read, rather than "Invalid Date": a row
 * from before this was recorded should say nothing at all.
 */
export function whenText(at: string): string | null {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;

  const time = CLOCK.format(date);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return `today at ${time}`;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;

  // Past that, the date itself — with the year only when it isn't this
  // one, which is the same rule the rest of the app follows.
  const sameYear = date.getFullYear() === today.getFullYear();
  return `${(sameYear ? DAY : DAY_WITH_YEAR).format(date)} at ${time}`;
}

/*
 * Built once. `Intl` formatters are the costly part of this function, and
 * the popup it sits in re-renders on every keystroke.
 */
/** The date alone, for a caption that is about a day rather than a moment. */
export function dayText(at: string): string | null {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getFullYear() === new Date().getFullYear() ? DAY : DAY_WITH_YEAR).format(date);
}

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DAY_WITH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
