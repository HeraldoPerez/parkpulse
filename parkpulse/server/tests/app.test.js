import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { createApp, MAX_PARKS, parseParkCodes } from "../src/app.js";
import { UpstreamError } from "../src/errors.js";
import { normalizeAlert, normalizePark } from "../src/normalize.js";
import { fixture, silentLogger } from "./helpers.js";

const FETCHED_AT = new Date("2026-11-09T12:00:00Z");
const parkList = fixture("parks.json").data.map(normalizePark);
const alertList = fixture("alerts.json").data.map(normalizeAlert);

/** A stand-in for CachedValue. */
function source(value, { stale = false } = {}) {
  return { get: async () => ({ value, fetchedAt: FETCHED_AT, stale }) };
}
function failing(error) {
  return {
    get: async () => {
      throw error;
    },
  };
}

/** Starts the app on a free port and returns a `get(path)` helper. */
async function serve(deps) {
  const app = createApp({ parks: source(parkList), alerts: source(alertList), logger: silentLogger, ...deps });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: async (urlPath) => {
      const res = await fetch(base + urlPath);
      const type = res.headers.get("content-type") ?? "";
      return { res, body: type.includes("json") ? await res.json() : await res.text() };
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe("API", () => {
  let api;
  before(async () => (api = await serve()));
  after(() => api.close());

  test("GET /api/health", async () => {
    const { res, body } = await api.get("/api/health");
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
  });

  test("GET /api/parks returns every park with when it was fetched", async () => {
    const { res, body } = await api.get("/api/parks");
    assert.equal(res.status, 200);
    assert.equal(body.fetchedAt, "2026-11-09T12:00:00.000Z");
    assert.equal(body.stale, false);
    assert.equal(body.parks.length, 6);
    assert.equal(body.parks.find((p) => p.code === "yell").fullName, "Yellowstone National Park");
    assert.match(res.headers.get("cache-control"), /max-age=3600/);
  });

  test("GET /api/alerts groups alerts by park, in the order asked for", async () => {
    const { res, body } = await api.get("/api/alerts?parks=yell,zion");
    assert.equal(res.status, 200);
    assert.equal(body.fetchedAt, "2026-11-09T12:00:00.000Z");
    assert.equal(body.stale, false);
    assert.deepEqual(
      body.parks.map((p) => [p.code, p.fullName, p.alerts.length]),
      [
        ["yell", "Yellowstone National Park", 3],
        ["zion", "Zion National Park", 5],
      ],
    );
    assert.deepEqual(
      body.parks[1].alerts.map((a) => a.category),
      ["Park Closure", "Caution", "Caution", "Information", "Information"],
    );
  });

  test("park codes are case-insensitive, trimmed and de-duplicated", async () => {
    const { res, body } = await api.get("/api/alerts?parks=%20YELL%20,yell,Zion");
    assert.equal(res.status, 200);
    assert.deepEqual(
      body.parks.map((p) => p.code),
      ["yell", "zion"],
    );
  });

  test("?parks=a&parks=b works too", async () => {
    const { body } = await api.get("/api/alerts?parks=acad&parks=grca");
    assert.deepEqual(
      body.parks.map((p) => p.code),
      ["acad", "grca"],
    );
  });

  test("a park with no alerts gets an empty list", async () => {
    const { body } = await api.get("/api/alerts?parks=afam");
    assert.deepEqual(body.parks[0].alerts, []);
  });

  test("unknown park codes are a 400, not an empty answer", async () => {
    // The NPS API itself answers 200 with no data for a code that doesn't exist.
    const { res, body } = await api.get("/api/alerts?parks=yell,zzzz,qqqq");
    assert.equal(res.status, 400);
    assert.equal(body.error, "Unknown park codes: zzzz, qqqq");
  });

  for (const [query, pattern] of [
    ["", /Add the parks you want/],
    ["?parks=", /Add the parks you want/],
    ["?parks=yellowstone", /isn't a park code/],
    ["?parks=es-es/cham", /isn't a park code/],
    ["?parks=abcd,efgh,ijkl,mnop,qrst,uvwx,yzab,cdef,ghij,klmn,opqr", /at most 10 parks/],
  ]) {
    test(`GET /api/alerts${query} is a 400 that explains the problem`, async () => {
      const { res, body } = await api.get(`/api/alerts${query}`);
      assert.equal(res.status, 400);
      assert.match(body.error, pattern);
    });
  }

  test("unknown API routes are a JSON 404", async () => {
    const { res, body } = await api.get("/api/nope");
    assert.equal(res.status, 404);
    assert.deepEqual(body, { error: "Not found" });
  });

  test("sends security headers and hides Express", async () => {
    const { res } = await api.get("/api/health");
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
  });

  test("without a built client, / is a 404", async () => {
    const { res } = await api.get("/");
    assert.equal(res.status, 404);
  });
});

describe("API when the park service has problems", () => {
  test("stale data is passed on with stale: true", async () => {
    const api = await serve({ alerts: source(alertList, { stale: true }) });
    const { res, body } = await api.get("/api/alerts?parks=yell");
    await api.close();
    assert.equal(res.status, 200);
    assert.equal(body.stale, true);
  });

  test("an upstream error becomes a JSON error with a safe message", async () => {
    const error = new UpstreamError(502, "The National Park Service didn't accept this server's API key.", {
      detail: "GET /api/v1/alerts returned 403 API_KEY_INVALID",
    });
    const logged = [];
    const api = await serve({ alerts: failing(error), logger: { info() {}, error: (m) => logged.push(m) } });
    const { res, body } = await api.get("/api/alerts?parks=yell");
    await api.close();
    assert.equal(res.status, 502);
    assert.deepEqual(body, { error: "The National Park Service didn't accept this server's API key." });
    assert.match(logged.join("\n"), /API_KEY_INVALID/);
  });

  test("the hourly limit becomes a 503 with Retry-After", async () => {
    const error = new UpstreamError(503, "Try again in a few minutes.", { retryAfterSeconds: 300 });
    const api = await serve({ parks: failing(error) });
    const { res } = await api.get("/api/parks");
    await api.close();
    assert.equal(res.status, 503);
    assert.equal(res.headers.get("retry-after"), "300");
  });

  test("a bug becomes a plain 500 without details", async () => {
    const api = await serve({ parks: failing(new Error("secret internal detail")) });
    const { res, body } = await api.get("/api/parks");
    await api.close();
    assert.equal(res.status, 500);
    assert.doesNotMatch(JSON.stringify(body), /secret internal detail/);
  });
});

describe("serving the built client", () => {
  let dir;
  let api;
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "parkpulse-client-"));
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>ParkPulse</title>");
    writeFileSync(path.join(dir, "assets", "index-abc123.js"), "console.log('hi')");
    api = await serve({ clientDir: dir });
  });
  after(async () => {
    await api.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("/ serves the app with a content security policy", async () => {
    const { res, body } = await api.get("/");
    assert.equal(res.status, 200);
    assert.match(body, /<title>ParkPulse<\/title>/);
    assert.match(res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(res.headers.get("cache-control"), "no-cache");
  });

  test("a shared link like /?parks=yell,zion serves the app", async () => {
    const { res, body } = await api.get("/?parks=yell,zion");
    assert.equal(res.status, 200);
    assert.match(body, /ParkPulse/);
  });

  test("hashed assets are cached for a year", async () => {
    const { res } = await api.get("/assets/index-abc123.js");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control"), /immutable/);
  });

  test("API routes still answer JSON", async () => {
    const { res, body } = await api.get("/api/nope");
    assert.equal(res.status, 404);
    assert.deepEqual(body, { error: "Not found" });
  });
});

describe("parseParkCodes", () => {
  test("allows exactly MAX_PARKS", () => {
    const codes = Array.from({ length: MAX_PARKS }, (_, i) => `ab${String.fromCharCode(97 + i)}x`);
    assert.equal(parseParkCodes(codes.join(",")).length, MAX_PARKS);
  });

  test("ignores empty parts", () => {
    assert.deepEqual(parseParkCodes(",yell,,zion,"), ["yell", "zion"]);
  });

  test("keeps a long bad value short in the message", () => {
    assert.throws(
      () => parseParkCodes("x".repeat(500)),
      (error) => error.status === 400 && error.message.length < 100,
    );
  });
});
