import pino from "pino";

/** Structured JSON logs. Never log media contents, tokens or passwords. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.DFM_SERVICE ?? "web" },
  redact: ["password", "token", "*.password", "*.token", "headers.cookie", "headers.authorization"],
});
