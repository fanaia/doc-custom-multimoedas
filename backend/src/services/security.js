"use strict";

const crypto = require("node:crypto");
const { GenericError } = require("@oondemand/oon-core-back");

const PREFIX = "doc-custom:v1";

function encryptionKey() {
  const secret = String(
    process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY
      || process.env.OON_CREDENTIALS_ENCRYPTION_KEY
      || process.env.INSTANCE_CREDENTIAL_ENCRYPTION_KEY
      || "",
  ).trim();
  if (secret.length < 32) {
    throw new GenericError(
      "Configure DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY com no minimo 32 caracteres.",
      { statusCode: 503, code: "CREDENTIAL_KEY_REQUIRED" },
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value) {
  const clear = String(value || "");
  if (!clear) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clear, "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

function decrypt(value) {
  const input = String(value || "");
  if (!input) return "";
  const parts = input.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new GenericError("Credencial armazenada em formato invalido.", {
      statusCode: 500,
      code: "INVALID_ENCRYPTED_CREDENTIAL",
    });
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[2], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[4], "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function mask(value) {
  const clear = String(value || "");
  if (!clear) return "";
  if (clear.length <= 4) return "••••";
  return `${clear.slice(0, 2)}${"•".repeat(Math.min(8, clear.length - 4))}${clear.slice(-2)}`;
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = { decrypt, encrypt, generateToken, hash, mask, safeEqual, sha256Buffer };
