"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { attachmentExternalCode, attachmentPayload } = require("../src/services/integrations/omieGateway");

test("código interno do anexo respeita o limite de 20 caracteres da Omie", () => {
  const pdf = Buffer.from("%PDF-1.7 invoice");
  const code = attachmentExternalCode(pdf);

  assert.equal(code.length, 20);
  assert.equal(Buffer.byteLength(code, "utf8"), 20);
  assert.match(code, /^oon-[a-f0-9]{16}$/);
  assert.equal(attachmentExternalCode(pdf), code);
  assert.notEqual(attachmentExternalCode(Buffer.from("%PDF-1.7 other invoice")), code);
});

test("MD5 do anexo é calculado sobre a string Base64 enviada à Omie", () => {
  const { cArquivo, cMd5 } = attachmentPayload("invoice.pdf", Buffer.from("%PDF-1.7 invoice"));
  const zip = Buffer.from(cArquivo, "base64");

  assert.equal(cMd5, crypto.createHash("md5").update(cArquivo, "utf8").digest("hex"));
  assert.notEqual(cMd5, crypto.createHash("md5").update(zip).digest("hex"));
});
