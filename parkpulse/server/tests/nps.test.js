import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { UpstreamError } from "../src/errors.js";
import { createNpsClient } from "../src/nps.js";
import { fakeFetch, fixture, jsonResponse } from "./helpers.js";

const KEY = "test-key-123";

/** Serves a fixture the way the API does, honoring `start` and `limit`. */
function servePaged(name) {
  const body = fixture(name);
  return (url) => {
    const start = Number(url.searchParams.get("start") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return jsonResponse({
      total: String(body.data.length),
      limit: String(limit),
      start: String(start),
      data: body.data.slice(start, start + limit),
    });
  };
}

function client(handler, options = {}) {
  const fetch = fakeFetch(handler);
  return { nps: createNpsClient({ apiKey: KEY, fetch, ...options }), fetch };
}

describe("NPS client: requests", () => {
  test("sends the key in the X-Api-Key header, never in the URL", async () => {
    const { nps, fetch } = client(servePaged("alerts.json"));
    await nps.getAlerts();
    const [{ url, init }] = fetch.calls;
    assert.equal(init.headers["X-Api-Key"], KEY);
    assert.ok(!url.href.includes(KEY), url.href);
    assert.equal(url.searchParams.has("api_key"), false);
  });

  test("asks for one big page", async () => {
    const { nps, fetch } = client(servePaged("alerts.json"));
    await nps.getAlerts();
    assert.equal(fetch.calls.length, 1);
    assert.equal(fetch.calls[0].url.origin + fetch.calls[0].url.pathname, "https://developer.nps.gov/api/v1/alerts");
    assert.equal(fetch.calls[0].url.searchParams.get("limit"), "1000");
    assert.equal(fetch.calls[0].url.searchParams.get("start"), "0");
  });

  test("follows paging until it has every record", async () => {
    const { nps, fetch } = client(servePaged("alerts.json"), { pageSize: 5 });
    const alerts = await nps.getAlerts();
    assert.equal(alerts.length, 14);
    assert.deepEqual(
      fetch.calls.map((c) => c.url.searchParams.get("start")),
      ["0", "5", "10"],
    );
    assert.equal(new Set(alerts.map((a) => a.id)).size, 14, "no duplicates across pages");
  });

  test("stops at maxPages instead of paging forever", async () => {
    const endless = () => jsonResponse({ total: "99999", data: [fixture("alerts.json").data[0]] });
    const { nps, fetch } = client(endless, { pageSize: 1, maxPages: 3 });
    await assert.rejects(nps.getAlerts(), (error) => error instanceof UpstreamError && error.status === 502);
    assert.equal(fetch.calls.length, 3);
  });

  test("an empty result is fine", async () => {
    const { nps } = client(() => jsonResponse(fixture("empty.json")));
    assert.deepEqual(await nps.getAlerts(), []);
  });

  test("needs an API key", () => {
    assert.throws(() => createNpsClient({ apiKey: "" }), /apiKey/);
  });
});

describe("NPS client: data", () => {
  test("getParks returns slim parks sorted by full name", async () => {
    const { nps } = client(servePaged("parks.json"));
    const parks = await nps.getParks();
    assert.deepEqual(
      parks.map((p) => p.code),
      ["acad", "afam", "cham", "grca", "yell", "zion"],
    );
    assert.deepEqual(Object.keys(parks[0]).sort(), [
      "code",
      "designation",
      "fullName",
      "latitude",
      "longitude",
      "name",
      "states",
      "url",
    ]);
  });

  test("getAlerts drops alerts that can't be tied to a park", async () => {
    const { nps } = client(servePaged("alerts_odd_codes.json"));
    const alerts = await nps.getAlerts();
    assert.deepEqual(
      alerts.map((a) => a.parkCode),
      ["cham"],
    );
  });
});

describe("NPS client: errors", () => {
  async function failureFor(handler) {
    const { nps } = client(handler);
    try {
      await nps.getAlerts();
    } catch (error) {
      assert.ok(error instanceof UpstreamError, `expected UpstreamError, got ${error}`);
      assert.ok(!error.message.includes(KEY) && !String(error.detail).includes(KEY), "key must not leak");
      return error;
    }
    assert.fail("expected getAlerts to throw");
  }

  test("an invalid key says to check NPS_API_KEY", async () => {
    const error = await failureFor(() => jsonResponse(fixture("error_api_key_invalid.json"), { status: 403 }));
    assert.equal(error.status, 502);
    assert.equal(error.code, "API_KEY_INVALID");
    assert.match(error.message, /API key/);
    assert.match(error.detail, /NPS_API_KEY/);
  });

  test("a missing key is reported the same way", async () => {
    const error = await failureFor(() => jsonResponse(fixture("error_api_key_missing.json"), { status: 403 }));
    assert.equal(error.code, "API_KEY_MISSING");
    assert.equal(error.status, 502);
  });

  test("the hourly limit becomes a 503 with Retry-After", async () => {
    // Shape from the api.data.gov docs, which the NPS API runs behind.
    const body = { error: { code: "OVER_RATE_LIMIT", message: "You have exceeded your rate limit." } };
    const error = await failureFor(() => jsonResponse(body, { status: 429, headers: { "retry-after": "120" } }));
    assert.equal(error.status, 503);
    assert.equal(error.retryAfterSeconds, 120);
  });

  test("without a Retry-After header, suggests 5 minutes", async () => {
    const error = await failureFor(() => jsonResponse({}, { status: 429 }));
    assert.equal(error.retryAfterSeconds, 300);
  });

  test("a server error becomes a 502", async () => {
    const error = await failureFor(() => new Response("<html>Bad gateway</html>", { status: 500 }));
    assert.equal(error.status, 502);
    assert.equal(error.upstreamStatus, 500);
  });

  test("a 200 that isn't JSON becomes a 502", async () => {
    const error = await failureFor(() => new Response("<html>maintenance</html>", { status: 200 }));
    assert.equal(error.status, 502);
    assert.match(error.message, /couldn't read/);
  });

  test("JSON without a data array becomes a 502", async () => {
    const error = await failureFor(() => jsonResponse({ total: "0" }));
    assert.equal(error.status, 502);
  });

  test("a network failure becomes a 502", async () => {
    const error = await failureFor(() => {
      throw new TypeError("fetch failed");
    });
    assert.equal(error.status, 502);
    assert.match(error.message, /Couldn't reach/);
  });

  test("a timeout becomes a 504", async () => {
    // A server that would answer after 5 seconds. Its pending timer also keeps Node's event loop
    // running, the way an open socket does (Node 22 cancels the test without it).
    const slow = (_url, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(jsonResponse(fixture("empty.json"))), 5_000);
        init.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(init.signal.reason);
        });
      });
    const { nps } = client(slow, { timeoutMs: 20 });
    await assert.rejects(nps.getAlerts(), (error) => error instanceof UpstreamError && error.status === 504);
  });
});
