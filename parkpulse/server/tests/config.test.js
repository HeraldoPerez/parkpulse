import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadConfig } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

describe("loadConfig", () => {
  test("reads the key and uses port 3001 by default", () => {
    assert.deepEqual(loadConfig({ NPS_API_KEY: "abc123" }), { apiKey: "abc123", port: 3001 });
  });

  test("trims spaces around the key", () => {
    assert.equal(loadConfig({ NPS_API_KEY: "  abc123\n" }).apiKey, "abc123");
  });

  for (const value of [undefined, "", "   "]) {
    test(`a missing key (${JSON.stringify(value)}) explains where to get one`, () => {
      assert.throws(
        () => loadConfig({ NPS_API_KEY: value }),
        (error) =>
          error instanceof ConfigError &&
          error.message.includes(".env.example") &&
          error.message.includes("nps.gov/subjects/developer"),
      );
    });
  }

  test("reads PORT", () => {
    assert.equal(loadConfig({ NPS_API_KEY: "k", PORT: "8080" }).port, 8080);
    assert.equal(loadConfig({ NPS_API_KEY: "k", PORT: "" }).port, 3001);
  });

  for (const value of ["abc", "3001.5", "-1", "70000"]) {
    test(`rejects PORT=${value}`, () => {
      assert.throws(() => loadConfig({ NPS_API_KEY: "k", PORT: value }), ConfigError);
    });
  }
});
