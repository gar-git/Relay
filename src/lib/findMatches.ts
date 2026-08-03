export interface TextMatch {
  start: number;
  end: number;
  line: number;
}

/** Case-insensitive match positions within text. */
export function findMatches(text: string, query: string): TextMatch[] {
  const q = query.trim();
  if (!q || !text) return [];

  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  const matches: TextMatch[] = [];
  let from = 0;

  while (from <= hay.length - needle.length) {
    const idx = hay.indexOf(needle, from);
    if (idx === -1) break;
    const line = text.slice(0, idx).split('\n').length - 1;
    matches.push({ start: idx, end: idx + needle.length, line });
    from = idx + Math.max(1, needle.length);
  }

  return matches;
}

export function lineHasMatch(lineText: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return lineText.toLowerCase().includes(q.toLowerCase());
}
