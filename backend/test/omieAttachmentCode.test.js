"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { attachmentExternalCode } = require("../src/services/integrations/omieGateway");

test("código interno do anexo respeita o limite de 20 caracteres da Omie", () => {
  const pdf = Buffer.from("%PDF-1.7 invoice");
  const code = attachmentExternalCode(pdf);

  assert.equal(code.length, 20);
  assert.match(code, /^oon-[a-f0-9]{16}$/);
  assert.equal(attachmentExternalCode(pdf), code);
  assert.notEqual(attachmentExternalCode(Buffer.from("%PDF-1.7 other invoice")), code);
});
