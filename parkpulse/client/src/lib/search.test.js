import { describe, expect, test } from "vitest";
import { parks } from "../test/data.js";
import { fold, searchParks } from "./search.js";

const codes = (results) => results.map((p) => p.code);

describe("searchParks", () => {
  test("finds a park by the start of its name", () => {
    expect(codes(searchParks(parks, "yell"))).toEqual(["yell"]);
    expect(codes(searchParks(parks, "Grand"))).toEqual(["grca"]);
  });

  test("finds a park by any word in its name", () => {
    expect(codes(searchParks(parks, "smoky"))).toEqual(["grsm"]);
  });

  test("an exact park code comes first", () => {
    expect(codes(searchParks(parks, "arch"))[0]).toBe("arch");
  });

  test("a two-letter state finds the parks there, national parks first", () => {
    expect(codes(searchParks(parks, "ut"))).toEqual(["arch", "zion", "cebr"]);
  });

  test("ignores accents and the ʻokina", () => {
    expect(codes(searchParks(parks, "hawaii"))).toEqual(["havo"]);
  });

  test("matches inside a name for longer queries", () => {
    expect(codes(searchParks(parks, "canyon"))).toEqual(["grca"]);
    expect(codes(searchParks(parks, "anyon"))).toEqual(["grca"]);
  });

  test("leaves out parks already picked", () => {
    expect(codes(searchParks(parks, "ut", ["zion"]))).toEqual(["arch", "cebr"]);
  });

  test("an empty query or no match gives nothing", () => {
    expect(searchParks(parks, "  ")).toEqual([]);
    expect(searchParks(parks, "zzzzz")).toEqual([]);
  });

  test("respects the limit", () => {
    expect(searchParks(parks, "national", [], 3)).toHaveLength(3);
  });
});

test("fold", () => {
  expect(fold("  Haleakalā ")).toBe("haleakala");
  expect(fold("Hawaiʻi")).toBe("hawaii");
});
