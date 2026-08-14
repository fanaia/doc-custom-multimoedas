"use strict";

const SECRET_KEY = /(secret|token|password|senha|credential|authorization|appkey|chave)/i;

function sanitize(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      code: value.code || "INTERNAL_ERROR",
      message: String(value.message || "Falha inesperada").slice(0, 1000),
      statusCode: Number(value.statusCode || value.status || 500),
    };
  }
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      output[key] = SECRET_KEY.test(key) ? "[redacted]" : sanitize(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "string") return value.slice(0, 5000);
  return value;
}

function errorSummary(error) {
  const clean = sanitize(error);
  return {
    code: clean.code || "INTERNAL_ERROR",
    message: clean.message || "Falha inesperada.",
    statusCode: clean.statusCode || 500,
  };
}

module.exports = { errorSummary, sanitize };
