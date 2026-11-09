import { describe, expect, test } from "vitest";
import { categoryInfo, countByCategory, formatDate, isOld, timeAgo } from "./format.js";

describe("categoryInfo", () => {
  test("known categories get a short label and a color", () => {
    expect(categoryInfo("Park Closure")).toMatchObject({ label: "Closure", tone: "closure" });
    expect(categoryInfo("Danger")).toMatchObject({ label: "Danger", tone: "danger" });
  });

  test("a new category from the API still shows", () => {
    expect(categoryInfo("Fire Restrictions")).toMatchObject({ label: "Fire Restrictions", tone: "other" });
  });
});

describe("countByCategory", () => {
  test("counts, most serious first, with plurals", () => {
    const alerts = ["Information", "Park Closure", "Caution", "Park Closure", "Danger", "Something New"].map((category) => ({ category }));
    expect(countByCategory(alerts).map((c) => c.text)).toEqual([
      "1 danger alert",
      "2 closures",
      "1 caution",
      "1 info alert",
      "1 something new alert",
    ]);
  });

  test("nothing to count", () => {
    expect(countByCategory([])).toEqual([]);
  });
});

describe("dates", () => {
  test("formatDate doesn't shift the day in any time zone", () => {
    expect(formatDate("2026-11-04")).toBe("Nov 4, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  test("isOld is true after a year", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    expect(isOld("2025-11-01", now)).toBe(true);
    expect(isOld("2026-01-01", now)).toBe(false);
    expect(isOld(null, now)).toBe(false);
  });

  test("timeAgo", () => {
    const now = Date.parse("2026-11-09T12:00:00Z");
    expect(timeAgo("2026-11-09T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-09T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-11-09T11:59:00Z", now)).toBe("1 minute ago");
    expect(timeAgo("2026-11-09T09:00:00Z", now)).toBe("3 hours ago");
    expect(timeAgo("2026-11-06T12:00:00Z", now)).toBe("3 days ago");
  });
});
