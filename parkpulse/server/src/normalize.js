// Turns raw National Park Service API records into the smaller, cleaner
// shapes ParkPulse sends to the browser.

const PARK_CODE = /^[a-z]{4}$/;

/** Order alerts are shown in, most serious first. Unknown categories go last. */
export const CATEGORY_ORDER = ["Danger", "Park Closure", "Caution", "Information"];

/**
 * Returns a lowercase 4-letter park code, or null.
 * The API sometimes prefixes a language, as in "es-es/cham", so only the last part counts.
 */
export function normalizeParkCode(raw) {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase().split("/").pop();
  return PARK_CODE.test(code) ? code : null;
}

/** Returns a park for the picker, or null if the record has no usable park code. */
export function normalizePark(raw) {
  const code = normalizeParkCode(raw?.parkCode);
  if (!code) return null;

  const fullName = text(raw.fullName) || text(raw.name) || code.toUpperCase();
  return {
    code,
    name: text(raw.name) || fullName,
    fullName,
    designation: text(raw.designation),
    states: text(raw.states)
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    latitude: coordinate(raw.latitude, 90),
    longitude: coordinate(raw.longitude, 180),
    url: safeUrl(raw.url) ?? `https://www.nps.gov/${code}/index.htm`,
  };
}

/** Returns an alert, or null if it can't be tied to a park or has no title. */
export function normalizeAlert(raw) {
  const parkCode = normalizeParkCode(raw?.parkCode);
  const title = text(raw?.title);
  if (!parkCode || !title) return null;

  return {
    id: text(raw.id),
    parkCode,
    title,
    description: text(raw.description),
    category: text(raw.category) || "Information",
    url: safeUrl(raw.url),
    lastUpdated: npsDate(raw.lastIndexedDate),
    roadEvents: (Array.isArray(raw.relatedRoadEvents) ? raw.relatedRoadEvents : [])
      .map((event) => ({ id: text(event?.id), title: text(event?.title), url: safeUrl(event?.url) }))
      .filter((event) => event.title),
  };
}

/** Sorts alerts most serious first, then most recently updated first. Doesn't change the input. */
export function sortAlerts(alerts) {
  const rank = (category) => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...alerts].sort(
    (a, b) =>
      rank(a.category) - rank(b.category) ||
      (b.lastUpdated ?? "").localeCompare(a.lastUpdated ?? "") ||
      a.title.localeCompare(b.title),
  );
}

/**
 * Builds the response for the chosen parks, in the order they were asked for.
 * @param {string[]} codes
 * @param {Map<string, ReturnType<typeof normalizePark>>} parksByCode
 * @param {ReturnType<typeof normalizeAlert>[]} alerts
 */
export function alertsForParks(codes, parksByCode, alerts) {
  const byPark = new Map(codes.map((code) => [code, []]));
  for (const alert of alerts) byPark.get(alert.parkCode)?.push(alert);

  return codes.map((code) => {
    const park = parksByCode.get(code);
    return {
      code,
      name: park?.name ?? code.toUpperCase(),
      fullName: park?.fullName ?? code.toUpperCase(),
      url: park?.url ?? `https://www.nps.gov/${code}/index.htm`,
      alerts: sortAlerts(byPark.get(code)),
    };
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function coordinate(value, limit) {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

/** Only http(s) links, so nothing like "javascript:" ever reaches a link in the page. */
function safeUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** "2026-11-04 00:00:00.0" -> "2026-11-04". The API doesn't say which time zone, so only the date is kept. */
function npsDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(value));
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? match[0] : null;
}
