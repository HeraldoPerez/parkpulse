// Which parks are picked. Kept in the URL (so a trip can be shared as a link)
// and in localStorage (so it's still there next visit).

export const MAX_PARKS = 10;
const STORAGE_KEY = "parkpulse:parks";

/** "yell,ZION,zion,bad!" -> ["yell", "zion"] */
export function parseCodes(text) {
  const codes = [];
  for (const part of String(text ?? "").split(",")) {
    const code = part.trim().toLowerCase();
    if (/^[a-z]{4}$/.test(code) && !codes.includes(code)) codes.push(code);
  }
  return codes.slice(0, MAX_PARKS);
}

/** A link with ?parks= wins. Otherwise use what was saved last time. */
export function readSelection({ search = window.location.search, storage = browserStorage() } = {}) {
  const fromUrl = new URLSearchParams(search).get("parks");
  if (fromUrl !== null) return parseCodes(fromUrl);
  try {
    return parseCodes(storage?.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Updates the address bar (without adding a history entry) and saves for next time. */
export function writeSelection(codes, { location = window.location, history = window.history, storage = browserStorage() } = {}) {
  const url = new URL(location.href);
  if (codes.length > 0) url.searchParams.set("parks", codes.join(","));
  else url.searchParams.delete("parks");
  const search = url.search.replaceAll("%2C", ",");
  history.replaceState(history.state, "", `${url.pathname}${search}${url.hash}`);

  try {
    storage?.setItem(STORAGE_KEY, codes.join(","));
  } catch {
    // Private mode or blocked storage. The URL still has the selection.
  }
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
