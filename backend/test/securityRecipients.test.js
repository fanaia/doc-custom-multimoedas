"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeRecipients } = require("../src/services/recipients");
const { decrypt, encrypt, hash, mask, safeEqual } = require("../src/services/security");

test("credenciais usam AES-GCM e não ficam legíveis", () => {
  const previous = process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY;
  process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY = "chave-de-teste-com-mais-de-trinta-e-dois-caracteres";
  try {
    const encrypted = encrypt("segredo-omie");
    assert.ok(encrypted.startsWith("doc-custom:v1:"));
    assert.ok(!encrypted.includes("segredo-omie"));
    assert.equal(decrypt(encrypted), "segredo-omie");
    assert.throws(() => decrypt(`${encrypted.slice(0, -1)}x`));
    assert.equal(mask("abcdefghijkl"), "ab••••••••kl");
    assert.equal(hash("a"), hash("a"));
    assert.equal(safeEqual("token", "token"), true);
    assert.equal(safeEqual("token", "outro"), false);
  } finally {
    if (previous === undefined) delete process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY = previous;
  }
});

test("destinatários são validados e deduplicados entre To, CC e BCC", () => {
  const result = normalizeRecipients({
    to: ["Cliente@Example.com; outro@example.com", "inválido"],
    cc: ["cliente@example.com", "cc@example.com"],
    bcc: "CC@example.com bcc@example.com",
  });
  assert.deepEqual(result.to, ["cliente@example.com", "outro@example.com"]);
  assert.deepEqual(result.cc, ["cc@example.com"]);
  assert.deepEqual(result.bcc, ["bcc@example.com"]);
  assert.deepEqual(result.invalid, ["inválido"]);
});
