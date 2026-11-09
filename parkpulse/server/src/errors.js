/** An error with an HTTP status and a message that's safe to show users. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message Shown to users, so it must never contain secrets.
   * @param {{ cause?: unknown, retryAfterSeconds?: number }} [options]
   */
  constructor(status, message, { cause, retryAfterSeconds } = {}) {
    super(message, { cause });
    this.name = "HttpError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The National Park Service API failed, refused us, or sent something we can't use. */
export class UpstreamError extends HttpError {
  /**
   * @param {number} status Status to send to our own client (502, 503 or 504).
   * @param {string} message Safe to show users.
   * @param {{ detail?: string, upstreamStatus?: number, code?: string, cause?: unknown, retryAfterSeconds?: number }} [options]
   *   `detail` is for the server log only.
   */
  constructor(status, message, { detail, upstreamStatus, code, cause, retryAfterSeconds } = {}) {
    super(status, message, { cause, retryAfterSeconds });
    this.name = "UpstreamError";
    this.detail = detail;
    this.upstreamStatus = upstreamStatus;
    this.code = code;
  }
}

/** The server can't start because something in the environment is missing or wrong. */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}
