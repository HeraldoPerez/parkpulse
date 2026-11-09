import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  alertsForParks,
  normalizeAlert,
  normalizePark,
  normalizeParkCode,
  sortAlerts,
} from "../src/normalize.js";
import { fixture } from "./helpers.js";

const rawParks = fixture("parks.json").data;
const rawAlerts = fixture("alerts.json").data;
const rawPark = (code) => structuredClone(rawParks.find((p) => p.parkCode === code));
const rawAlert = (id) => structuredClone(rawAlerts.find((a) => a.id.startsWith(id)));

describe("normalizeParkCode", () => {
  const cases = [
    ["yell", "yell"],
    [" YELL ", "yell"],
    ["es-es/cham", "cham"], // seen in the real alerts feed
    ["", null],
    ["yel", null],
    ["yello", null],
    ["ye11", null],
    [undefined, null],
    [42, null],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(normalizeParkCode(input), expected);
    });
  }
});

describe("normalizePark", () => {
  test("keeps what the picker and map need", () => {
    assert.deepEqual(normalizePark(rawPark("yell")), {
      code: "yell",
      name: "Yellowstone",
      fullName: "Yellowstone National Park",
      designation: "National Park",
      states: ["ID", "MT", "WY"],
      latitude: 44.59824417,
      longitude: -110.5471695,
      url: "https://www.nps.gov/yell/index.htm",
    });
  });

  test("an empty designation stays empty", () => {
    const park = normalizePark(rawPark("afam"));
    assert.equal(park.designation, "");
    assert.equal(park.fullName, "African American Civil War Memorial");
  });

  test("missing coordinates and url get safe defaults", () => {
    const raw = { ...rawPark("zion"), latitude: "", longitude: "not a number", url: "javascript:alert(1)" };
    const park = normalizePark(raw);
    assert.equal(park.latitude, null);
    assert.equal(park.longitude, null);
    assert.equal(park.url, "https://www.nps.gov/zion/index.htm");
  });

  test("returns null without a usable park code", () => {
    assert.equal(normalizePark({ ...rawPark("zion"), parkCode: "" }), null);
    assert.equal(normalizePark(null), null);
  });
});

describe("normalizeAlert", () => {
  test("turns a real alert into the shape the app uses", () => {
    assert.deepEqual(normalizeAlert(rawAlert("57EFE369")), {
      id: "57EFE369-9186-400A-8F18-0E966993B8A3",
      parkCode: "yell",
      title: "Traffic Delays - Gardner River High Bridge",
      description: rawAlert("57EFE369").description,
      category: "Information",
      url: "https://www.nps.gov/yell/planyourvisit/parkroads.htm",
      lastUpdated: "2026-10-29",
      roadEvents: [
        {
          id: "57EFE369-9186-400A-8F18-0E966993B8A3",
          title: "Traffic Delays - Gardner River High Bridge",
          url: "https://www.nps.gov/yell/planyourvisit/conditions.htm",
        },
      ],
    });
  });

  test("an empty url becomes null", () => {
    assert.equal(normalizeAlert(rawAlert("390127CA")).url, null);
  });

  test("only http and https links are kept", () => {
    assert.equal(normalizeAlert({ ...rawAlert("390127CA"), url: "javascript:alert(1)" }).url, null);
    assert.equal(normalizeAlert({ ...rawAlert("390127CA"), url: "not a url" }).url, null);
  });

  test("bad or missing dates become null", () => {
    assert.equal(normalizeAlert({ ...rawAlert("390127CA"), lastIndexedDate: "" }).lastUpdated, null);
    assert.equal(normalizeAlert({ ...rawAlert("390127CA"), lastIndexedDate: "2026-02-31 00:00:00.0" }).lastUpdated, null);
  });

  test("a missing category counts as Information", () => {
    assert.equal(normalizeAlert({ ...rawAlert("390127CA"), category: "" }).category, "Information");
  });

  test("alerts with odd park codes: a language prefix is kept, a blank code is dropped", () => {
    const [spanish, blank] = fixture("alerts_odd_codes.json").data;
    assert.equal(normalizeAlert(spanish).parkCode, "cham");
    assert.equal(normalizeAlert(blank), null);
  });

  test("alerts without a title are dropped", () => {
    assert.equal(normalizeAlert({ ...rawAlert("390127CA"), title: "  " }), null);
  });
});

describe("sortAlerts", () => {
  test("most serious first, then newest", () => {
    const grca = rawAlerts.filter((a) => a.parkCode === "grca").map(normalizeAlert);
    assert.deepEqual(
      sortAlerts(grca).map((a) => [a.category, a.lastUpdated]),
      [
        ["Danger", "2026-09-11"],
        ["Park Closure", "2026-11-01"],
        ["Caution", "2026-09-30"],
        ["Caution", "2026-06-26"],
      ],
    );
  });

  test("unknown categories go last and the input isn't changed", () => {
    const input = [
      { title: "b", category: "Something New", lastUpdated: "2026-11-01" },
      { title: "a", category: "Information", lastUpdated: "2026-01-01" },
    ];
    const copy = structuredClone(input);
    assert.deepEqual(
      sortAlerts(input).map((a) => a.category),
      ["Information", "Something New"],
    );
    assert.deepEqual(input, copy);
  });
});

describe("alertsForParks", () => {
  const parksByCode = new Map(rawParks.map(normalizePark).map((p) => [p.code, p]));
  const alerts = rawAlerts.map(normalizeAlert);

  test("groups alerts by park, in the order asked for", () => {
    const result = alertsForParks(["zion", "yell", "afam"], parksByCode, alerts);
    assert.deepEqual(
      result.map((p) => [p.code, p.name, p.alerts.length]),
      [
        ["zion", "Zion", 5],
        ["yell", "Yellowstone", 3],
        ["afam", "African American Civil War Memorial", 0],
      ],
    );
    assert.deepEqual(
      result[1].alerts.map((a) => a.title),
      [
        "Most Park Roads Closed to All Vehicles",
        "Biscuit Basin Closed Due to Hydrothermal Explosion",
        "Traffic Delays - Gardner River High Bridge",
      ],
    );
  });
});
