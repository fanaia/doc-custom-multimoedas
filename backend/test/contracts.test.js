"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { registry, scopedIdFilter } = require("@oondemand/oon-core-back");
const { canonical, isOsStageEvent, normalizeWebhook } = require("../src/services/webhookService");
const { assertOsContract, normalizeOs } = require("../src/services/invoiceVariables");
const { sanitize } = require("../src/services/sanitization");

function loadModels() {
  registry.reset();
  const directory = path.join(__dirname, "../src/models");
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".js") && name !== "_shared.js").sort()) {
    delete require.cache[require.resolve(path.join(directory, file))];
    require(path.join(directory, file));
  }
}

test("todas as models de negócio têm escopo e campo de tenant", () => {
  loadModels();
  const entries = registry.listModels();
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    [
      "ArtefatoPdf",
      "BaseOmie",
      "Configuracao",
      "CotacaoMoeda",
      "EtapaOmie",
      "EventoProcesso",
      "Gatilho",
      "GatilhoBase",
      "Imagem",
      "Moeda",
      "Pessoa",
      "ProcessoFatura",
      "Template",
    ],
  );
  for (const entry of entries) {
    assert.equal(entry.definition.scope, "tenant", entry.name);
    assert.deepEqual(entry.definition.tenancy, { scope: "tenant", tenantField: "tenantId" }, entry.name);
    assert.ok(entry.mongooseModel.schema.path("tenantId"), entry.name);
    assert.equal(entry.mongooseModel.schema.path("tenantId").options.select, false, entry.name);
  }
  const Base = registry.getModel("BaseOmie");
  assert.deepEqual(
    scopedIdFilter(Base, "507f1f77bcf86cd799439011", { tenantId: "tenant-a", tenancyModel: "multi_tenant" }),
    { _id: "507f1f77bcf86cd799439011", tenantId: "tenant-a" },
  );
  for (const secret of ["appKeyEncrypted", "appSecretEncrypted", "webhookTokenEncrypted", "webhookTokenHash"]) {
    assert.equal(Base.mongooseModel.schema.path(secret).options.select, false);
  }
});

test("normalização de webhook é canônica e preserva id do evento", () => {
  assert.equal(canonical({ b: 2, a: { d: 4, c: 3 } }), canonical({ a: { c: 3, d: 4 }, b: 2 }));
  const normalized = normalizeWebhook({
    topic: "OrdemServico.Alterada", eventId: "evt-42", appKey: "base-a",
    event: { nCodOS: 123, cEtapa: "50" },
  });
  assert.deepEqual(
    { eventId: normalized.eventId, codigoOs: normalized.codigoOs, etapa: normalized.etapa, ping: normalized.ping },
    { eventId: "evt-42", codigoOs: "123", etapa: "50", ping: false },
  );
  assert.equal(normalizeWebhook({ topic: "ping", ping: true }).ping, true);
  assert.equal(isOsStageEvent("OrdemServico.Alterada"), true);
  assert.equal(isOsStageEvent("Ordem de Serviço - mudança de etapa"), true);
  assert.equal(isOsStageEvent("OrdemServico.Incluida"), false);
  assert.equal(isOsStageEvent("PedidoVenda.Alterado"), false);
});

test("resposta parcial da Omie falha com campos compreensíveis e defaults seguros", () => {
  assert.throws(
    () => assertOsContract({ Cabecalho: { nCodOS: 1 } }),
    (error) => error.code === "OMIE_OS_PARTIAL_RESPONSE" && /cNumOS/.test(error.message),
  );
  const normalized = normalizeOs({
    Cabecalho: { nCodOS: 1 }, ServicosPrestados: [], InfoCadastro: { dDtInc: "14/08/2026" },
  });
  assert.deepEqual(normalized.Parcelas, []);
  assert.deepEqual(normalized.despesasReembolsaveis.despesaReembolsavel, []);
  assert.equal(normalized.Observacoes.cObsOS, "");
});

test("auditoria sanitiza segredos, buffers e profundidade", () => {
  const result = sanitize({ appSecret: "não-vazar", authorization: "Bearer token", normal: "ok", file: Buffer.alloc(4) });
  assert.equal(result.appSecret, "[redacted]");
  assert.equal(result.authorization, "[redacted]");
  assert.equal(result.normal, "ok");
  assert.equal(result.file, "[buffer:4]");
});
