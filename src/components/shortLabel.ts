/**
 * Words a phone card writes shorter (v0.81). A card's first line is a name
 * and a chip or two, and every pixel a chip gives back goes to the name —
 * "Production company" alone took a third of the line. Matched by the
 * label's first word, so a renamed type or category keeps its
 * abbreviation; whoever draws the short form keeps the full one in the
 * chip's title.
 */
const SHORT_FIRST_WORDS: Record<string, string> = {
  production: "Prod.",
  preparing: "Prep.",
  preparation: "Prep.",
};

export function shortLabel(label: string): string {
  const first = label.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return SHORT_FIRST_WORDS[first] ?? label;
}
