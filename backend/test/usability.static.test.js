"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("upload de imagem deriva MIME e tamanho no servidor e oferece visualizacao", () => {
  const routes = read("src/routes/docCustom.js");
  assert.match(routes, /imagens\/upload/);
  assert.match(routes, /Buffer\.byteLength\(conteudo, "base64"\)/);
  assert.match(routes, /imagens\/:id\/conteudo/);
});

test("preview de template exige dados Omie do tenant", () => {
  const workflow = read("src/services/invoiceWorkflow.js");
  assert.match(workflow, /previewTemplate/);
  assert.match(workflow, /tenantId: accessContext\.tenantId/);
  assert.match(workflow, /findScopedBase\(input\.baseOmieId/);
});

test("tickets de integracao Omie estao registrados", () => {
  const mapping = read("src/mappings/omie.js");
  const ui = read("../frontend/central.ui.json");
  assert.match(mapping, /defineOmieMapping\("doc-custom-multimoedas"/);
  assert.match(ui, /Tickets de Integração/);
});
