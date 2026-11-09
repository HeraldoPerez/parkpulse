/** An error from the ParkPulse server, with a message that's fine to show. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function getJson(path, { signal } = {}) {
  let response;
  try {
    response = await fetch(path, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("Couldn't reach the ParkPulse server. Check your connection and try again.", 0);
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // handled below
  }

  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Couldn't reach the ParkPulse server (status ${response.status}). Is it running?`,
      response.status,
    );
  }
  if (!body) throw new ApiError("The ParkPulse server sent something unexpected.", response.status);
  return body;
}

/** @returns {Promise<{ fetchedAt: string, stale: boolean, parks: Park[] }>} */
export function getParks(options) {
  return getJson("/api/parks", options);
}

/** @returns {Promise<{ fetchedAt: string, stale: boolean, parks: ParkAlerts[] }>} */
export function getAlerts(codes, options) {
  return getJson(`/api/alerts?parks=${codes.map(encodeURIComponent).join(",")}`, options);
}

/**
 * @typedef {{ code: string, name: string, fullName: string, designation: string, states: string[],
 *   latitude: number | null, longitude: number | null, url: string }} Park
 * @typedef {{ id: string, parkCode: string, title: string, description: string, category: string,
 *   url: string | null, lastUpdated: string | null, roadEvents: { id: string, title: string, url: string | null }[] }} Alert
 * @typedef {{ code: string, name: string, fullName: string, url: string, alerts: Alert[] }} ParkAlerts
 */
