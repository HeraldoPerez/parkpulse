import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CachedValue } from "../src/cache.js";

function setup(options = {}) {
  let now = 1_000_000;
  let calls = 0;
  let loader = async () => `value ${calls}`;
  const cached = new CachedValue({
    load: () => {
      calls++;
      return loader();
    },
    ttlMs: 1_000,
    maxStaleMs: 5_000,
    retryDelayMs: 100,
    now: () => now,
    ...options,
  });
  return {
    cached,
    advance: (ms) => (now += ms),
    now: () => now,
    calls: () => calls,
    loadWith: (fn) => (loader = fn),
  };
}

const fail = async () => {
  throw new Error("upstream down");
};

describe("CachedValue", () => {
  test("loads on the first get and reports when", async () => {
    const t = setup();
    const result = await t.cached.get();
    assert.equal(result.value, "value 1");
    assert.equal(result.stale, false);
    assert.equal(result.fetchedAt.getTime(), t.now());
    assert.equal(t.calls(), 1);
  });

  test("serves a fresh value without loading again", async () => {
    const t = setup();
    await t.cached.get();
    t.advance(999);
    assert.equal((await t.cached.get()).value, "value 1");
    assert.equal(t.calls(), 1);
  });

  test("loads again once the value is older than ttlMs", async () => {
    const t = setup();
    await t.cached.get();
    t.advance(1_000);
    const result = await t.cached.get();
    assert.equal(result.value, "value 2");
    assert.equal(result.stale, false);
    assert.equal(t.calls(), 2);
  });

  test("requests that arrive during a load share it", async () => {
    const t = setup();
    let finish;
    t.loadWith(() => new Promise((resolve) => (finish = resolve)));
    const pending = [t.cached.get(), t.cached.get(), t.cached.get()];
    finish("shared");
    const results = await Promise.all(pending);
    assert.deepEqual(
      results.map((r) => r.value),
      ["shared", "shared", "shared"],
    );
    assert.equal(t.calls(), 1);
  });

  test("a failed first load throws, and the next get tries again", async () => {
    const t = setup();
    t.loadWith(fail);
    await assert.rejects(t.cached.get(), /upstream down/);
    t.loadWith(async () => "recovered");
    assert.equal((await t.cached.get()).value, "recovered");
    assert.equal(t.calls(), 2);
  });

  test("if a refresh fails, serves the old value marked stale", async () => {
    const t = setup();
    await t.cached.get();
    const firstFetch = t.now();
    t.advance(2_000);
    t.loadWith(fail);
    const result = await t.cached.get();
    assert.equal(result.value, "value 1");
    assert.equal(result.stale, true);
    assert.equal(result.fetchedAt.getTime(), firstFetch);
  });

  test("after a failed refresh, waits retryDelayMs before asking upstream again", async () => {
    const t = setup();
    await t.cached.get();
    t.advance(2_000);
    t.loadWith(fail);
    await t.cached.get(); // fails, serves stale
    assert.equal(t.calls(), 2);

    t.advance(50);
    assert.equal((await t.cached.get()).stale, true);
    assert.equal(t.calls(), 2, "should not call upstream again so soon");

    t.advance(100);
    t.loadWith(async () => "fresh again");
    const result = await t.cached.get();
    assert.equal(result.value, "fresh again");
    assert.equal(result.stale, false);
    assert.equal(t.calls(), 3);
  });

  test("throws once the old value is past maxStaleMs", async () => {
    const t = setup();
    await t.cached.get();
    t.advance(1_000 + 5_000);
    t.loadWith(fail);
    await assert.rejects(t.cached.get(), /upstream down/);
  });

  test("with maxStaleMs 0, never serves an expired value", async () => {
    const t = setup({ maxStaleMs: 0 });
    await t.cached.get();
    t.advance(1_000);
    t.loadWith(fail);
    await assert.rejects(t.cached.get(), /upstream down/);
  });
});
