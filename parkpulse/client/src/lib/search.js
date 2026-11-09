// Finds parks for the picker as you type.

/** Lowercase, no accents or ʻokina, so "haleakala" finds "Haleakalā" and "hawaii" finds "Hawaiʻi". */
export function fold(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻ‘’']/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Parks matching `query`, best first. Matches a park code ("yell"), a state ("UT"),
 * or the start of any word in the name ("smoky" finds Great Smoky Mountains).
 * @param {import("../api.js").Park[]} parks
 * @param {string} query
 * @param {string[]} [exclude] Codes already picked.
 * @param {number} [limit]
 */
export function searchParks(parks, query, exclude = [], limit = 8) {
  const q = fold(query);
  if (!q) return [];

  const scored = [];
  for (const park of parks) {
    if (exclude.includes(park.code)) continue;
    const score = scoreOf(park, q);
    if (score !== null) scored.push({ park, score });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.park.designation === "National Park") - Number(a.park.designation === "National Park") ||
      a.park.fullName.localeCompare(b.park.fullName),
  );
  return scored.slice(0, limit).map((s) => s.park);
}

function scoreOf(park, q) {
  const name = fold(park.fullName);
  if (park.code === q) return 0;
  if (name.startsWith(q) || fold(park.name).startsWith(q)) return 1;
  if (name.split(/[\s,.-]+/).some((word) => word.startsWith(q))) return 2;
  if (q.length === 2 && park.states.includes(q.toUpperCase())) return 3;
  if (q.length >= 3 && name.includes(q)) return 4;
  return null;
}
