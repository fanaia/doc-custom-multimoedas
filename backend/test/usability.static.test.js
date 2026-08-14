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
  const frontend = read("../frontend/src/main.tsx");
  assert.match(workflow, /previewTemplate/);
  assert.match(workflow, /tenantId: accessContext\.tenantId/);
  assert.match(workflow, /findScopedBase\(input\.baseOmieId/);
  assert.match(workflow, /numeroOs: input\.numeroOs \|\| input\.codigoOs/);
  assert.match(frontend, /\{ baseOmieId, numeroOs \}/);
  assert.match(frontend, /Migalhas de navegação/);
});

test("cadastro de etapas por base usa somente catalogo sincronizado do tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(routes, /validateMappingInput/);
  assert.match(routes, /tenantId, baseOmieId: base\._id, codigo: \{ \$in: stages \}, status: "ativo"/);
  assert.match(routes, /Esta base ja possui etapas cadastradas neste gatilho/);
  assert.match(frontend, /Cadastrar etapas da base/);
  assert.match(frontend, /item\.status==="ativo"&&String\(item\.baseOmieId/);
});

test("tickets de integracao Omie estao registrados", () => {
  const mapping = read("src/mappings/omie.js");
  const ui = read("../frontend/central.ui.json");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(mapping, /defineOmieMapping\("doc-custom-multimoedas"/);
  assert.match(frontend, /Tickets de Integração/);
});

test("SendGrid e webhook unico usam credenciais isoladas por tenant", () => {
  const sender = read("src/services/emailSender.js");
  const credentials = read("src/services/sendgridCredentials.js");
  const webhook = read("src/services/baseCredentials.js");
  const frontend = read("../frontend/src/main.tsx");
  assert.doesNotMatch(sender, /process\.env\.SENDGRID_API_KEY/);
  assert.match(credentials, /Config\(\)\.findOne\(\{ tenantId/);
  assert.match(credentials, /apiKeyEncrypted: encrypt\(apiKey\)/);
  assert.match(webhook, /\/api\/doc-custom\/webhooks\/omie\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(frontend, /Use esta mesma URL em todos os tópicos desta base/);
});

test("bases sincronizam etapas categorias e contas correntes por tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const gateway = read("src/services/integrations/omieGateway.js");
  assert.match(routes, /categorias\/sincronizar/);
  assert.match(routes, /contas-correntes\/sincronizar/);
  assert.match(routes, /tenantId: accessContext\.tenantId/);
  assert.match(gateway, /data\?\.cadastros/);
});

test("templates imagens e configuracoes possuem manutencao operacional", () => {
  const routes = read("src/routes/docCustom.js");
  assert.match(routes, /private\.delete\("\/templates\/:id"/);
  assert.match(routes, /private\.put\("\/imagens\/:id"/);
  assert.match(routes, /private\.delete\("\/configuracoes\/:id"/);
});

test("listas Omie ficam fora do menu e moedas padrao sao criadas por tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const ui = read("../frontend/central.ui.json");
  assert.match(routes, /DEFAULT_CURRENCIES/);
  assert.match(routes, /codigo: "USD"/);
  assert.match(routes, /codigo: "EUR"/);
  assert.match(routes, /codigo: "JPY"/);
  assert.match(routes, /filter: \{ tenantId, codigo: currency\.codigo \}/);
  assert.match(ui, /"model": "CategoriaOmie"[^\n]+"hidden": true/);
  assert.match(ui, /"model": "ContaCorrenteOmie"[^\n]+"hidden": true/);
});
