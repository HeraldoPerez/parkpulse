import { describe, expect, test } from "vitest";
import { MAX_PARKS, parseCodes, readSelection, writeSelection } from "./selection.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
}

const throwingStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

describe("parseCodes", () => {
  test("lowercases, trims, de-duplicates and drops anything that isn't a park code", () => {
    expect(parseCodes(" YELL ,zion,zion,bad!,yellowstone,,grca")).toEqual(["yell", "zion", "grca"]);
  });

  test(`keeps at most ${MAX_PARKS}`, () => {
    const many = Array.from({ length: 15 }, (_, i) => `aa${String.fromCharCode(97 + i)}a`).join(",");
    expect(parseCodes(many)).toHaveLength(MAX_PARKS);
  });

  test("handles null and undefined", () => {
    expect(parseCodes(null)).toEqual([]);
    expect(parseCodes(undefined)).toEqual([]);
  });
});

describe("readSelection", () => {
  test("a ?parks= link wins over what was saved", () => {
    const storage = memoryStorage({ "parkpulse:parks": "acad" });
    expect(readSelection({ search: "?parks=yell,zion", storage })).toEqual(["yell", "zion"]);
  });

  test("an empty ?parks= means none, even if something was saved", () => {
    const storage = memoryStorage({ "parkpulse:parks": "acad" });
    expect(readSelection({ search: "?parks=", storage })).toEqual([]);
  });

  test("without a link, uses what was saved", () => {
    expect(readSelection({ search: "", storage: memoryStorage({ "parkpulse:parks": "acad,grca" }) })).toEqual(["acad", "grca"]);
  });

  test("blocked storage doesn't break anything", () => {
    expect(readSelection({ search: "", storage: throwingStorage })).toEqual([]);
    expect(readSelection({ search: "", storage: null })).toEqual([]);
  });
});

describe("writeSelection", () => {
  function fakeWindow(href) {
    const calls = [];
    return {
      location: { href },
      history: { state: null, replaceState: (_state, _title, url) => calls.push(url) },
      calls,
    };
  }

  test("puts the parks in the URL with readable commas and saves them", () => {
    const w = fakeWindow("https://parkpulse.example/?utm=x#top");
    const storage = memoryStorage();
    writeSelection(["yell", "zion"], { ...w, storage });
    expect(w.calls).toEqual(["/?utm=x&parks=yell,zion#top"]);
    expect(storage.data.get("parkpulse:parks")).toBe("yell,zion");
  });

  test("removes ?parks= when nothing is picked", () => {
    const w = fakeWindow("https://parkpulse.example/?parks=yell");
    writeSelection([], { ...w, storage: memoryStorage() });
    expect(w.calls).toEqual(["/"]);
  });

  test("blocked storage doesn't break anything", () => {
    const w = fakeWindow("https://parkpulse.example/");
    expect(() => writeSelection(["yell"], { ...w, storage: throwingStorage })).not.toThrow();
    expect(w.calls).toEqual(["/?parks=yell"]);
  });
});
