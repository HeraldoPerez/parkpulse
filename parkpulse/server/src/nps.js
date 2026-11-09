import { UpstreamError } from "./errors.js";
import { normalizeAlert, normalizePark } from "./normalize.js";

export const NPS_BASE_URL = "https://developer.nps.gov/api/v1";

/**
 * Client for the National Park Service Data API.
 *
 * The key goes in the X-Api-Key header, never in the URL, so it can't leak
 * into logs or error messages that include the URL.
 *
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} [options.baseUrl]
 * @param {typeof fetch} [options.fetch] Tests pass a fake one.
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pageSize] Records per request. 1000 gets every park or alert in one request today.
 * @param {number} [options.maxPages] Safety limit on paging.
 */
export function createNpsClient({
  apiKey,
  baseUrl = NPS_BASE_URL,
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = 30_000,
  pageSize = 1000,
  maxPages = 50,
}) {
  if (!apiKey) throw new Error("createNpsClient needs an apiKey");

  async function request(path, params) {
    const url = new URL(baseUrl.replace(/\/$/, "") + path);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));

    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      if (cause?.name === "TimeoutError") {
        throw new UpstreamError(504, "The National Park Service took too long to answer. Try again in a minute.", {
          detail: `GET ${url.pathname} timed out after ${timeoutMs} ms`,
          cause,
        });
      }
      throw new UpstreamError(502, "Couldn't reach the National Park Service. Try again in a minute.", {
        detail: `GET ${url.pathname} failed: ${cause?.message ?? cause}`,
        cause,
      });
    }

    const body = await readJson(response);
    if (!response.ok) throw errorFor(response, body, url);
    if (!body || !Array.isArray(body.data)) {
      throw new UpstreamError(502, "The National Park Service sent a response ParkPulse couldn't read.", {
        detail: `GET ${url.pathname} returned ${response.status} without a data array`,
        upstreamStatus: response.status,
      });
    }
    return body;
  }

  /** Follows `start`/`limit` paging until it has `total` records. */
  async function listAll(path) {
    const items = [];
    for (let page = 0; page < maxPages; page++) {
      const body = await request(path, { limit: pageSize, start: items.length });
      items.push(...body.data);
      const total = Number(body.total);
      if (body.data.length === 0 || !Number.isFinite(total) || items.length >= total) return items;
    }
    throw new UpstreamError(502, "The National Park Service sent more data than expected.", {
      detail: `GET ${path} still had more records after ${maxPages} pages of ${pageSize}`,
    });
  }

  return {
    /** Every park, sorted by name. */
    async getParks() {
      const parks = (await listAll("/parks")).map(normalizePark).filter(Boolean);
      return parks.sort((a, b) => a.fullName.localeCompare(b.fullName, "en"));
    },

    /** Every current alert for every park. One request serves any mix of parks. */
    async getAlerts() {
      return (await listAll("/alerts")).map(normalizeAlert).filter(Boolean);
    },
  };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Turns an error response into a message for users and a detail line for the log. */
function errorFor(response, body, url) {
  const status = response.status;
  const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
  const detail = `GET ${url.pathname} returned ${status}${code ? ` ${code}` : ""}`;

  if (code?.startsWith("API_KEY_")) {
    return new UpstreamError(502, "The National Park Service didn't accept this server's API key.", {
      detail: `${detail}. Check NPS_API_KEY in .env or your host's settings.`,
      upstreamStatus: status,
      code,
    });
  }
  if (status === 429 || code === "OVER_RATE_LIMIT") {
    const retryAfter = Number(response.headers.get("retry-after"));
    return new UpstreamError(503, "ParkPulse has hit the National Park Service's request limit. Try again in a few minutes.", {
      detail: `${detail}. The API key's hourly limit is used up.`,
      upstreamStatus: status,
      code,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 300,
    });
  }
  return new UpstreamError(502, "The National Park Service API is having problems right now. Try again in a few minutes.", {
    detail,
    upstreamStatus: status,
    code,
  });
}
