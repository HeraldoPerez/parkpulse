import { readFileSync } from "node:fs";

/** Reads a recorded API response from tests/fixtures. A fresh copy each time, so tests can change it. */
export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A stand-in for fetch that records each call and answers with `handler(url, init)`. */
export function fakeFetch(handler) {
  const calls = [];
  const fn = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}

export const silentLogger = { info() {}, error() {} };
