/**
 * One value that's expensive to fetch (the park list, or all current alerts),
 * kept in memory and refreshed when it gets old.
 *
 * - While the value is fresh, `get()` returns it without calling `load`.
 * - Requests that arrive while a load is running share that one load.
 * - If a refresh fails but the old value isn't too old, `get()` returns the
 *   old value with `stale: true` instead of failing. After a failed refresh
 *   it waits `retryDelayMs` before asking the upstream API again, so a
 *   struggling API isn't hit on every request.
 */
export class CachedValue {
  #load;
  #ttlMs;
  #maxStaleMs;
  #retryDelayMs;
  #now;
  #entry = null; // { value, fetchedAt }
  #pending = null; // Promise while a load is running
  #lastFailure = null; // { at, error }

  /**
   * @param {object} options
   * @param {() => Promise<unknown>} options.load Fetches a new value.
   * @param {number} options.ttlMs How long a value counts as fresh.
   * @param {number} [options.maxStaleMs] How much longer an old value may be served if a refresh fails.
   * @param {number} [options.retryDelayMs] How long to wait after a failed refresh before trying again.
   * @param {() => number} [options.now] Clock in milliseconds. Tests pass a fake one.
   */
  constructor({ load, ttlMs, maxStaleMs = 0, retryDelayMs = 30_000, now = Date.now }) {
    this.#load = load;
    this.#ttlMs = ttlMs;
    this.#maxStaleMs = maxStaleMs;
    this.#retryDelayMs = retryDelayMs;
    this.#now = now;
  }

  /** @returns {Promise<{ value: any, fetchedAt: Date, stale: boolean }>} */
  async get() {
    const now = this.#now();
    const entry = this.#entry;
    if (entry && now - entry.fetchedAt < this.#ttlMs) return this.#result(entry, false);

    const usable = entry && now - entry.fetchedAt < this.#ttlMs + this.#maxStaleMs;
    const recentlyFailed = this.#lastFailure && now - this.#lastFailure.at < this.#retryDelayMs;
    if (usable && recentlyFailed) return this.#result(entry, true);

    try {
      return this.#result(await this.#loadOnce(), false);
    } catch (error) {
      const fallback = this.#entry;
      if (fallback && this.#now() - fallback.fetchedAt < this.#ttlMs + this.#maxStaleMs) {
        return this.#result(fallback, true);
      }
      throw error;
    }
  }

  #loadOnce() {
    if (!this.#pending) {
      this.#pending = (async () => {
        try {
          const value = await this.#load();
          this.#entry = { value, fetchedAt: this.#now() };
          this.#lastFailure = null;
          return this.#entry;
        } catch (error) {
          this.#lastFailure = { at: this.#now(), error };
          throw error;
        } finally {
          this.#pending = null;
        }
      })();
    }
    return this.#pending;
  }

  #result(entry, stale) {
    return { value: entry.value, fetchedAt: new Date(entry.fetchedAt), stale };
  }
}
