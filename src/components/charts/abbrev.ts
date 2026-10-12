/**
 * Axis labels for the three-months-by-category chart (SPEC §16.7 F, decision
 * 201): category names abbreviated so more bands fit before the drawing has
 * to scroll sideways, each carrying its full name as the hover hint.
 *
 * “Groceries” → “Grocer'”, “Personal” → “Person'”, “Vehicle Running” →
 * “Vehicle'”: a one-word name longer than seven characters is cut to six and
 * given the truncation apostrophe; a longer name whose first word already
 * fits keeps that word plus the apostrophe; a name that fits is left whole.
 * The apostrophe is the honest signal that a name was shortened — the full
 * name is always one hover away (and always spelled out in the table twin).
 */
export function abbrevCategory(name: string): string {
  const firstWord = name.split(' ')[0] ?? name;
  if (name.length <= 7) return name;
  if (firstWord !== name && firstWord.length <= 7) return `${firstWord}'`;
  return `${firstWord.slice(0, 6)}'`;
}
