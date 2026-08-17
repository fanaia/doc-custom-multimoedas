"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { registry, scopedIdFilter } = require("@oondemand/oon-core-back");
const { archivePreviousUnsentProcesses, archiveProcessesOutsideMappedStage, canonical, createProcess, isOsStageEvent, matchesAppKeyMask, normalizeWebhook } = require("../src/services/webhookService");
const { assertOsContract, normalizeOs } = require("../src/services/invoiceVariables");
const { isMappedProcessingStage } = require("../src/services/invoiceWorkflow");
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
  const entries = registry.listModels().filter((entry) => entry.name !== "Pessoa");
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    [
      "ArtefatoPdf",
      "BaseOmie",
      "CategoriaOmie",
      "Configuracao",
      "ContaCorrenteOmie",
      "CotacaoMoeda",
      "EtapaOmie",
      "EventoProcesso",
      "Gatilho",
      "GatilhoBase",
      "Imagem",
      "IntegracaoTicket",
      "Moeda",
      "ProcessoFatura",
      "SendGridConfig",
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
  for (const secret of ["appKeyEncrypted", "appKeyHash", "appSecretEncrypted", "webhookTokenEncrypted", "webhookTokenHash"]) {
    assert.equal(Base.mongooseModel.schema.path(secret).options.select, false);
  }
  assert.equal(registry.getModel("SendGridConfig").mongooseModel.schema.path("apiKeyEncrypted").options.select, false);
  const processIndexes = registry.getModel("ProcessoFatura").mongooseModel.schema.indexes();
  assert.equal(processIndexes.some(([keys, options]) => keys.processoAnteriorId === 1 && options.unique), false);
  assert.equal(processIndexes.some(([keys, options]) => keys.idempotencyKey === 1 && options.unique), true);
});

test("normalização de webhook é canônica e preserva id do evento", () => {
  assert.equal(canonical({ b: 2, a: { d: 4, c: 3 } }), canonical({ a: { c: 3, d: 4 }, b: 2 }));
  const normalized = normalizeWebhook({
    topic: "OrdemServico.EtapaAlterada", eventId: "evt-42", appKey: "base-a",
    event: { nCodOS: 123, cEtapa: "50" },
  });
  assert.deepEqual(
    { eventId: normalized.eventId, codigoOs: normalized.codigoOs, etapa: normalized.etapa, ping: normalized.ping },
    { eventId: "evt-42", codigoOs: "123", etapa: "50", ping: false },
  );
  assert.equal(normalizeWebhook({ topic: "ping", ping: true }).ping, true);
  const omieConnect = normalizeWebhook({
    messageId: "msg-65", topic: "OrdemServico.EtapaAlterada", appKey: "base-a",
    event: { numeroOrdemServico: "65", idOrdemServico: 4951204645, etapa: "20" },
  });
  assert.deepEqual(
    { eventId: omieConnect.eventId, codigoOs: omieConnect.codigoOs, numeroOs: omieConnect.numeroOs, etapa: omieConnect.etapa },
    { eventId: "msg-65", codigoOs: "4951204645", numeroOs: "65", etapa: "20" },
  );
  assert.equal(isOsStageEvent("OrdemServico.EtapaAlterada"), true);
  assert.equal(isOsStageEvent("Ordem de Serviço - mudança de etapa"), false);
  assert.equal(isOsStageEvent("OrdemServico.Incluida"), false);
  assert.equal(isOsStageEvent("PedidoVenda.Alterado"), false);
  assert.equal(matchesAppKeyMask("3908593091403", "39••••••••03"), true);
  assert.equal(matchesAppKeyMask("9908593091403", "39••••••••03"), false);
});

test("reentrega do webhook recupera processo idempotente e nunca acessa resultado nulo", async () => {
  const Process = registry.getModel("ProcessoFatura").mongooseModel;
  const Event = registry.getModel("EventoProcesso").mongooseModel;
  const originalFindOne = Process.findOne;
  const originalCreate = Process.create;
  const originalFind = Process.find;
  const originalUpdateMany = Process.updateMany;
  const originalInsertMany = Event.insertMany;
  const existing = {
    _id: "507f1f77bcf86cd799439021",
    tenantId: "tenant-a",
    htmlSnapshotPendente: "<html>invoice</html>",
    templateSnapshot: { document: { codigo: "invoice" } },
    variaveisSnapshot: { os: { Cabecalho: { nCodOS: 4951204645 } } },
  };
  try {
    Process.findOne = () => ({ select: async () => existing });
    Process.find = () => ({ select: async () => [] });
    Process.create = async () => { throw new Error("nao deveria criar novamente"); };
    const duplicate = await createProcess({
      base: { _id: "507f1f77bcf86cd799439011", tenantId: "tenant-a" },
      mapping: { _id: "507f1f77bcf86cd799439012" },
      trigger: { _id: "507f1f77bcf86cd799439013" },
      normalized: { codigoOs: "4951204645", numeroOs: "65", etapa: "20", eventId: "msg-65", topic: "OrdemServico.EtapaAlterada" },
    });
    assert.equal(duplicate.process, existing);
    assert.equal(duplicate.duplicate, true);

    Process.findOne = () => ({ select: async () => null });
    Process.create = async () => { const error = new Error("duplicate key"); error.code = 11000; throw error; };
    await assert.rejects(
      () => createProcess({
        base: { _id: "507f1f77bcf86cd799439011", tenantId: "tenant-a" },
        mapping: { _id: "507f1f77bcf86cd799439012" },
        trigger: { _id: "507f1f77bcf86cd799439013" },
        normalized: { codigoOs: "4951204645", numeroOs: "65", etapa: "20", eventId: "msg-66", topic: "OrdemServico.EtapaAlterada" },
      }),
      (error) => error.code === "WEBHOOK_PROCESS_CONFLICT",
    );
  } finally {
    Process.findOne = originalFindOne;
    Process.create = originalCreate;
    Process.find = originalFind;
    Process.updateMany = originalUpdateMany;
    Event.insertMany = originalInsertMany;
  }
});

test("nova entrada da OS arquiva somente processos anteriores ainda não enviados", async () => {
  const Process = registry.getModel("ProcessoFatura").mongooseModel;
  const Event = registry.getModel("EventoProcesso").mongooseModel;
  const originalFind = Process.find;
  const originalUpdateMany = Process.updateMany;
  const originalInsertMany = Event.insertMany;
  const previous = [{ _id: "507f1f77bcf86cd799439031", tentativas: 2 }];
  let update;
  let events;
  try {
    Process.find = (filter) => {
      assert.equal(filter.codigoOs, "4951204645");
      assert.deepEqual(filter.status.$in, ["ativo", "falha", "rejeitado"]);
      assert.ok(filter.$or.some((condition) => condition.emailEnviadoEm === null));
      return { select: async () => previous };
    };
    Process.updateMany = async (filter, operation) => { update = { filter, operation }; };
    Event.insertMany = async (items) => { events = items; };
    const archived = await archivePreviousUnsentProcesses({
      base: { _id: "507f1f77bcf86cd799439011", tenantId: "tenant-a" },
      trigger: { _id: "507f1f77bcf86cd799439013" },
      normalized: { codigoOs: "4951204645", eventId: "new-entry-65" },
      currentProcessId: "507f1f77bcf86cd799439099",
    });
    assert.equal(archived, 1);
    assert.equal(update.operation.$set.status, "arquivado");
    assert.equal(update.operation.$set.etapa, "Arquivado");
    assert.equal(events[0].processoId, previous[0]._id);
    assert.equal(events[0].detalhes.substituidoPor, "507f1f77bcf86cd799439099");
  } finally {
    Process.find = originalFind;
    Process.updateMany = originalUpdateMany;
    Event.insertMany = originalInsertMany;
  }
});

test("mudança para fora da etapa mapeada arquiva uma única vez o ticket não enviado", async () => {
  const Process = registry.getModel("ProcessoFatura").mongooseModel;
  const Mapping = registry.getModel("GatilhoBase").mongooseModel;
  const Event = registry.getModel("EventoProcesso").mongooseModel;
  const originalFindProcess = Process.find;
  const originalFindMapping = Mapping.find;
  const originalUpdateMany = Process.updateMany;
  const originalInsertMany = Event.insertMany;
  const process = {
    _id: "507f1f77bcf86cd799439041",
    gatilhoBaseId: "507f1f77bcf86cd799439012",
    tentativas: 1,
  };
  let update;
  let events;
  try {
    Process.find = (filter) => {
      assert.equal(filter.codigoOs, "4951204645");
      return { select: () => ({ lean: async () => [process] }) };
    };
    Mapping.find = () => ({ lean: async () => [{
      _id: process.gatilhoBaseId,
      etapaEnvio: "20",
    }] });
    Process.updateMany = async (filter, operation) => { update = { filter, operation }; };
    Event.insertMany = async (items) => { events = items; };
    const archived = await archiveProcessesOutsideMappedStage({
      base: { _id: "507f1f77bcf86cd799439011", tenantId: "tenant-a" },
      normalized: { codigoOs: "4951204645", etapa: "30", eventId: "move-65" },
    });
    assert.equal(archived, 1);
    assert.equal(update.operation.$set.status, "arquivado");
    assert.match(update.operation.$set.alerta, /etapa mapeada/);
    assert.equal(events[0].detalhes.etapaMapeada, "20");
    assert.equal(events[0].detalhes.etapaRecebida, "30");

    Process.find = () => ({ select: () => ({ lean: async () => [] }) });
    assert.equal(await archiveProcessesOutsideMappedStage({
      base: { _id: "507f1f77bcf86cd799439011", tenantId: "tenant-a" },
      normalized: { codigoOs: "4951204645", etapa: "30", eventId: "move-65" },
    }), 0);
  } finally {
    Process.find = originalFindProcess;
    Mapping.find = originalFindMapping;
    Process.updateMany = originalUpdateMany;
    Event.insertMany = originalInsertMany;
  }
});

test("arquivamento só move a OS que ainda está na etapa de processamento mapeada", () => {
  const mapping = { etapaEnvio: "20", etapaErro: "30" };
  assert.equal(isMappedProcessingStage({ Cabecalho: { cEtapa: "20" } }, mapping), true);
  assert.equal(isMappedProcessingStage({ Cabecalho: { cEtapa: "30" } }, mapping), false);
  assert.equal(isMappedProcessingStage({ Cabecalho: {} }, mapping), false);
  assert.equal(isMappedProcessingStage(null, mapping), false);
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
