"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { advanceDueDate, buildStageUpdate, omieDueDateD1, retryDelayMs } = require("../src/services/integrations/omieGateway");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("monta alteração da OS com adiantamento conforme contrato legado do Omie", () => {
  const payload = buildStageUpdate({
    Cabecalho: { nCodOS: 123, dDtPrevisao: "17/08/2026", cCodParc: "999" },
    Observacoes: { cObsOS: "Anterior" },
    Parcelas: [{ nParcela: 1, nValor: 100 }, { nParcela: 2, nValor: 200 }],
  }, "50", "Invoice enviada.", {
    enabled: true,
    contaCorrenteCodigo: 456,
    categoriaCodigo: "1.01.02",
    referenceDate: new Date("2026-08-17T15:00:00-03:00"),
  });
  assert.equal(payload.Cabecalho.cEtapa, "50");
  assert.equal(payload.Cabecalho.cCodParc, "999");
  assert.equal(payload.Cabecalho.dDtPrevisao, "18/08/2026");
  assert.deepEqual(payload.Parcelas.map((item) => [item.parcela_adiantamento, item.categoria_adiantamento, item.conta_corrente_adiantamento]), [
    ["S", "1.01.02", 456], ["S", "1.01.02", 456],
  ]);
});

test("calcula D+1 no fuso de São Paulo inclusive na virada do mês", () => {
  assert.equal(omieDueDateD1(new Date("2026-08-31T23:30:00-03:00")), "01/09/2026");
});

test("preserva vencimento igual ou posterior a D+1 e corrige data anterior ou inválida", () => {
  const reference = new Date("2026-08-17T15:00:00-03:00");
  assert.equal(advanceDueDate("18/08/2026", reference), "18/08/2026");
  assert.equal(advanceDueDate("20/08/2026", reference), "20/08/2026");
  assert.equal(advanceDueDate("17/08/2026", reference), "18/08/2026");
  assert.equal(advanceDueDate("data-inválida", reference), "18/08/2026");
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


test("ticket prepara snapshot completo uma vez e as automações reutilizam as configurações", () => {
  const webhook = read("src/services/webhookService.js");
  const workflow = read("src/services/invoiceWorkflow.js");
  const variables = read("src/services/invoiceVariables.js");
  assert.match(webhook, /workflow\.prepareInvoiceSnapshot\(process/);
  assert.doesNotMatch(webhook, /gateway\.consultar(?:Os|Cliente|Pais)/);
  assert.match(workflow, /async function prepareInvoiceSnapshot/);
  assert.match(workflow, /const canReuseSnapshot = Boolean/);
  assert.match(workflow, /automationSettingsFromConfigurations\(invoiceProcess\.variaveisSnapshot\.configuracoes\)/);
  assert.match(workflow, /getConfiguration\(configurations, "email-destinatarios-internos"/);
  assert.match(variables, /processoId: adapters\.processoId \|\| processoId/);
});

test("redundância do Omie respeita o tempo solicitado sem consultas imediatas", () => {
  assert.equal(retryDelayMs(new Error("Consumo redundante detectado. Aguarde 49 segundos para tentar novamente (REDUNDANT).")), 49_000);
  assert.equal(retryDelayMs(new Error("Falha funcional")), 0);
  const workflow = read("src/services/invoiceWorkflow.js");
  assert.match(workflow, /const osForUpdate = variables\.os\?\.Cabecalho \? variables\.os : process\.codigoOs/);
  assert.match(workflow, /if \(retryAfterMs\) await \(adapters\.wait \|\| wait\)\(retryAfterMs\)/);
  assert.match(workflow, /a OS não será movida para erro durante esse intervalo/);
});
