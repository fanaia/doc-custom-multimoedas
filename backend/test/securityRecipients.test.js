"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeRecipients, withInternalCopies } = require("../src/services/recipients");
const { decrypt, encrypt, hash, mask, safeEqual } = require("../src/services/security");

test("credenciais usam AES-GCM e não ficam legíveis", () => {
  const previous = process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY;
  process.env.DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY = "chave-de-teste-com-mais-de-trinta-e-dois-caracteres";
  try {
    const encrypted = encrypt("segredo-omie");
    assert.ok(encrypted.startsWith("doc-custom:v1:"));
    assert.ok(!encrypted.includes("segredo-omie"));
    assert.equal(decrypt(encrypted), "segredo-omie");
    const replacement = encrypted.endsWith("A") ? "B" : "A";
    assert.throws(
      () => decrypt(`${encrypted.slice(0, -1)}${replacement}`),
      (error) => error.code === "CREDENTIAL_DECRYPT_FAILED"
    );
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

test("cópias internas são obrigatoriamente mescladas sem duplicar destinatários", () => {
  const result = withInternalCopies(
    normalizeRecipients({ to: "cliente@empresa.com", cc: "financeiro@empresa.com" }),
    ["interno@empresa.com", "CLIENTE@empresa.com", "financeiro@empresa.com"],
  );
  assert.deepEqual(result.to, ["cliente@empresa.com"]);
  assert.deepEqual(result.cc, ["financeiro@empresa.com", "interno@empresa.com"]);
  assert.deepEqual(result.bcc, []);
  assert.deepEqual(result.invalid, []);
});
