"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { buildStageUpdate } = require("../src/services/integrations/omieGateway");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("monta alteração da OS com adiantamento conforme contrato legado do Omie", () => {
  const payload = buildStageUpdate({
    Cabecalho: { nCodOS: 123, dDtPrevisao: "17/08/2026", cCodParc: "999" },
    Observacoes: { cObsOS: "Anterior" },
    Parcelas: [{ nParcela: 1, nValor: 100 }, { nParcela: 2, nValor: 200 }],
  }, "50", "Invoice enviada.", { enabled: true, contaCorrenteCodigo: 456, categoriaCodigo: "1.01.02" });
  assert.equal(payload.Cabecalho.cEtapa, "50");
  assert.deepEqual(payload.Parcelas.map((item) => [item.parcela_adiantamento, item.categoria_adiantamento, item.conta_corrente_adiantamento]), [
    ["S", "1.01.02", 456], ["S", "1.01.02", 456],
  ]);
});

test("adiantamento exige parcelas na OS", () => {
  assert.throws(() => buildStageUpdate(
    { Cabecalho: { nCodOS: 123 }, Observacoes: {}, Parcelas: [] }, "50", "Invoice enviada.",
    { enabled: true, contaCorrenteCodigo: 456, categoriaCodigo: "1.01.02" },
  ), (error) => error.code === "OMIE_ADVANCE_INSTALLMENTS_REQUIRED");
});

test("gatilho por base exige referências ativas e isoladas para o adiantamento", () => {
  const model = read("src/models/GatilhoBase.js");
  const routes = read("src/routes/docCustom.js");
  const rules = read("src/validations/domainRules.js");
  assert.match(model, /gerarAdiantamento/);
  assert.match(model, /contaCorrenteAdiantamentoId/);
  assert.match(model, /categoriaAdiantamentoId/);
  assert.match(routes, /OMIE_ADVANCE_CONFIGURATION_REQUIRED/);
  assert.match(routes, /baseOmieId: base\._id, status: "ativo"/);
  assert.match(rules, /Adiantamento exige conta corrente e categoria ativas da mesma Base Omie/);
});

test("configurações possuem abas e quatro automações auditáveis", () => {
  const frontend = read("../frontend/src/main.tsx");
  const configuration = read("src/services/configuration.js");
  const workflow = read("src/services/invoiceWorkflow.js");
  const webhook = read("src/services/webhookService.js");
  for (const label of ["Dados complementar do template", "E-mails Internos", "Automações", "Aprovação automática", "Revisão automática", "Envio automático", "Reprocessar falha automático"]) assert.match(frontend, new RegExp(label));
  assert.match(configuration, /AUTOMATION_DEFINITIONS/);
  assert.match(workflow, /runConfiguredAutomations/);
  assert.match(workflow, /AUTOMATIC_RETRY_MAX_ATTEMPTS/);
  assert.match(webhook, /setImmediate\(\(\) => workflow\.runConfiguredAutomations/);
});
