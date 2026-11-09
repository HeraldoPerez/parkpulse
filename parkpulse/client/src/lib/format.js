// Labels, colors, dates and counts for showing alerts.

const CATEGORIES = {
  Danger: { label: "Danger", tone: "danger", one: "danger alert", many: "danger alerts" },
  "Park Closure": { label: "Closure", tone: "closure", one: "closure", many: "closures" },
  Caution: { label: "Caution", tone: "caution", one: "caution", many: "cautions" },
  Information: { label: "Info", tone: "info", one: "info alert", many: "info alerts" },
};
const ORDER = Object.keys(CATEGORIES);

export function categoryInfo(category) {
  return (
    CATEGORIES[category] ?? {
      label: category,
      tone: "other",
      one: `${category.toLowerCase()} alert`,
      many: `${category.toLowerCase()} alerts`,
    }
  );
}

/** [{ category, count, text: "2 closures", tone }] with the most serious first. */
export function countByCategory(alerts) {
  const counts = new Map();
  for (const alert of alerts) counts.set(alert.category, (counts.get(alert.category) ?? 0) + 1);
  const rank = (category) => (ORDER.includes(category) ? ORDER.indexOf(category) : ORDER.length);
  return [...counts]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([category, count]) => {
      const info = categoryInfo(category);
      return { category, count, tone: info.tone, text: `${count} ${count === 1 ? info.one : info.many}` };
    });
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "2026-11-04" -> "Nov 4, 2026" */
export function formatDate(isoDate) {
  return dateFormat.format(new Date(`${isoDate}T00:00:00Z`));
}

const DAY = 24 * 60 * 60 * 1000;

/** True if the park service hasn't updated the alert for more than a year. Some alerts are from 2015. */
export function isOld(isoDate, now = Date.now()) {
  if (!isoDate) return false;
  return now - new Date(`${isoDate}T00:00:00Z`).getTime() > 365 * DAY;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago" */
export function timeAgo(isoTime, now = Date.now()) {
  const seconds = Math.round((now - new Date(isoTime).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return relative.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return relative.format(-hours, "hour");
  return relative.format(-Math.round(hours / 24), "day");
}
