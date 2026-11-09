import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { HttpError } from "./errors.js";
import { alertsForParks, normalizeParkCode } from "./normalize.js";

export const MAX_PARKS = 10;

/**
 * Builds the Express app. The data sources are passed in so tests can use fakes.
 *
 * @param {object} deps
 * @param {{ get(): Promise<{ value: any[], fetchedAt: Date, stale: boolean }> }} deps.parks All parks.
 * @param {{ get(): Promise<{ value: any[], fetchedAt: Date, stale: boolean }> }} deps.alerts All current alerts.
 * @param {string} [deps.clientDir] Built React app to serve, if it exists.
 * @param {Pick<Console, "info" | "error">} [deps.logger]
 */
export function createApp({ parks, alerts, clientDir, logger = console }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("query parser", "simple");

  app.use((_req, res, next) => {
    res.set({
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    next();
  });

  app.use("/api", (req, res, next) => {
    const started = performance.now();
    res.on("finish", () => {
      const ms = Math.round(performance.now() - started);
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    });
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // GET /api/parks -> every park, for the picker
  app.get("/api/parks", async (_req, res) => {
    const result = await parks.get();
    res.set("Cache-Control", "public, max-age=3600");
    res.json({ fetchedAt: result.fetchedAt.toISOString(), stale: result.stale, parks: result.value });
  });

  // GET /api/alerts?parks=yell,zion -> current alerts for those parks, most serious first
  app.get("/api/alerts", async (req, res) => {
    const codes = parseParkCodes(req.query.parks);
    const [parkList, alertList] = await Promise.all([parks.get(), alerts.get()]);

    const parksByCode = new Map(parkList.value.map((park) => [park.code, park]));
    const unknown = codes.filter((code) => !parksByCode.has(code));
    if (unknown.length > 0) {
      throw new HttpError(400, `Unknown park code${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
    }

    res.set("Cache-Control", "private, max-age=60");
    res.json({
      fetchedAt: alertList.fetchedAt.toISOString(),
      stale: alertList.stale,
      parks: alertsForParks(codes, parksByCode, alertList.value),
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // In production the server also serves the built React app.
  if (clientDir && existsSync(path.join(clientDir, "index.html"))) {
    app.use(
      express.static(clientDir, {
        index: false,
        setHeaders(res, filePath) {
          // Vite puts a content hash in every file name under assets/, so those never change.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.set("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    // Any other page (like /?parks=yell) gets the app, which reads the URL itself.
    app.get("/{*path}", (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  // Express 5 sends errors thrown in async handlers here.
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      if (err.status >= 500) logger.error(`${err.name}: ${err.detail ?? err.message}`);
      if (err.retryAfterSeconds) res.set("Retry-After", String(err.retryAfterSeconds));
      res.status(err.status).json({ error: err.message });
      return;
    }
    logger.error(err);
    res.status(500).json({ error: "Something went wrong on the ParkPulse server." });
  });

  return app;
}

/**
 * "yell,ZION, yell" -> ["yell", "zion"]. Also accepts ?parks=yell&parks=zion.
 * Throws a 400 error with a message that says how to fix the request.
 */
export function parseParkCodes(raw) {
  const parts = (Array.isArray(raw) ? raw : [raw ?? ""])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    throw new HttpError(400, 'Add the parks you want, like "?parks=yell,zion".');
  }

  const codes = [];
  for (const part of parts) {
    const code = normalizeParkCode(part);
    if (!code || code !== part.toLowerCase()) {
      throw new HttpError(400, `"${part.slice(0, 20)}" isn't a park code. Park codes are 4 letters, like "yell".`);
    }
    if (!codes.includes(code)) codes.push(code);
  }

  if (codes.length > MAX_PARKS) {
    throw new HttpError(400, `Pick at most ${MAX_PARKS} parks at a time.`);
  }
  return codes;
}
