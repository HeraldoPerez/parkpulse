import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { CachedValue } from "./cache.js";
import { loadConfig } from "./config.js";
import { ConfigError } from "./errors.js";
import { createNpsClient } from "./nps.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let config;
try {
  config = loadConfig();
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`ParkPulse can't start: ${error.message}`);
  process.exit(1);
}

const nps = createNpsClient({ apiKey: config.apiKey });

// The park list hardly changes, so it's fetched once a day (about 4 MB from the API, 110 KB to the browser).
const parks = new CachedValue({ load: () => nps.getParks(), ttlMs: 24 * HOUR, maxStaleMs: 7 * 24 * HOUR });

// Every current alert for every park comes back in one request (about 600 alerts, 330 KB),
// so the server makes about 6 alert requests an hour no matter how many people use it.
const alerts = new CachedValue({ load: () => nps.getAlerts(), ttlMs: 10 * MINUTE, maxStaleMs: 24 * HOUR });

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
const app = createApp({ parks, alerts, clientDir });

const server = app.listen(config.port, (error) => {
  if (error) {
    console.error(`ParkPulse can't start: ${error.message}`);
    process.exit(1);
  }
  console.log(`ParkPulse server listening on http://localhost:${server.address().port}`);
});
