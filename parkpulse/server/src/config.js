import { ConfigError } from "./errors.js";

const KEY_HELP = "https://www.nps.gov/subjects/developer/get-started.htm";

/**
 * Reads settings from environment variables.
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ apiKey: string, port: number }}
 */
export function loadConfig(env = process.env) {
  const apiKey = (env.NPS_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ConfigError(
      "NPS_API_KEY is not set. Copy .env.example to .env and add your free key from " +
        `${KEY_HELP} (or use DEMO_KEY to try ParkPulse, which allows about 10 requests an hour).`,
    );
  }

  return { apiKey, port: parsePort(env.PORT) };
}

function parsePort(raw) {
  if (raw === undefined || raw.trim() === "") return 3001;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new ConfigError(`PORT must be a whole number from 0 to 65535, not "${raw}".`);
  }
  return port;
}
