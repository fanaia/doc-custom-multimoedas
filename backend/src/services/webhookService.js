"use strict";

const { GenericError, registry } = require("@oondemand/oon-core-back");
const { resolveBaseByWebhookToken } = require("./baseCredentials");
const { hash, safeEqual } = require("./security");
const integrationTickets = require("./integrationTickets");

function Model(name) {
  return registry.getModel(name).mongooseModel;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function valueAt(payload, paths) {
  for (const path of paths) {
    let current = payload;
    for (const part of path.split(".")) current = current?.[part];
    if (current !== undefined && current !== null && current !== "") return current;
  }
  return undefined;
}

function normalizeWebhook(payload = {}) {
  const topic = String(valueAt(payload, ["topic", "eventType", "event_type", "evento", "message.topic"]) || "");
  const ping = Boolean(payload.ping || /ping|teste|test/i.test(topic));
  const numeroOs = valueAt(payload, [
    "numeroOrdemServico", "numero_os", "numeroOs",
    "event.numeroOrdemServico", "event.numero_os", "event.numeroOs",
    "data.numeroOrdemServico", "data.numero_os", "data.numeroOs",
    "entity.numeroOrdemServico", "entity.numero_os", "entity.numeroOs",
  ]);
  const codigoOs = valueAt(payload, [
    "idOrdemServico", "nCodOS", "codigo_os", "codigoOs",
    "event.idOrdemServico", "event.nCodOS", "event.codigo_os", "event.codigoOs",
    "data.idOrdemServico", "data.nCodOS", "data.codigo_os", "data.codigoOs",
    "entity.idOrdemServico", "entity.nCodOS", "entity.codigo_os", "entity.codigoOs",
  ]);
  const etapa = valueAt(payload, [
    "cEtapa", "etapa", "event.cEtapa", "event.etapa", "data.cEtapa", "entity.cEtapa",
  ]);
  const appKey = valueAt(payload, ["appKey", "app_key", "AppKey", "event.appKey", "data.appKey"]);
  const eventId = String(valueAt(payload, [
    "eventId", "event_id", "messageId", "message_id", "id", "event.id", "message.id",
  ]) || hash(canonical(payload)));
  return { appKey: String(appKey || ""), codigoOs: String(codigoOs || numeroOs || ""), numeroOs: String(numeroOs || ""), etapa: String(etapa || ""), eventId, ping, topic };
}

function isOsStageEvent(topic) {
  const normalized = String(topic || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  return normalized === "ordemservicoetapaalterada";
}

function matchesAppKeyMask(appKey, masked) {
  const clear = String(appKey || "");
  const visible = String(masked || "").replace(/•/g, "");
  return clear.length > 4 && visible.length === 4 && clear.startsWith(visible.slice(0, 2)) && clear.endsWith(visible.slice(-2));
}

async function verifyWebhookAppKey(base, appKey) {
  const receivedHash = hash(appKey);
  if (base.appKeyHash) return safeEqual(receivedHash, base.appKeyHash);
  // Migração de bases anteriores ao hash: o token opaco já autenticou a base;
  // a máscara adiciona uma verificação antes de fixar o hash recebido.
  if (!matchesAppKeyMask(appKey, base.appKeyMasked)) return false;
  await Model("BaseOmie").updateOne(
    { _id: base._id, tenantId: base.tenantId, $or: [{ appKeyHash: "" }, { appKeyHash: { $exists: false } }] },
    { $set: { appKeyHash: receivedHash } },
  );
  return true;
}

async function findProcessByIdempotencyKey(key, tenantId) {
  const process = await Model("ProcessoFatura").findOne({ idempotencyKey: key })
    .select("+tenantId +idempotencyKey");
  if (!process || String(process.tenantId) !== String(tenantId)) return null;
  return process;
}

async function archivePreviousUnsentProcesses({ base, trigger, normalized, currentProcessId }) {
  const filter = {
    tenantId: String(base.tenantId),
    baseOmieId: base._id,
    gatilhoId: trigger._id,
    codigoOs: normalized.codigoOs,
    _id: { $ne: currentProcessId },
    status: { $in: ["ativo", "falha", "rejeitado"] },
    $or: [{ emailEnviadoEm: null }, { emailEnviadoEm: { $exists: false } }],
  };
  const previous = await Model("ProcessoFatura").find(filter).select("+tenantId");
  if (!previous.length) return 0;
  const now = new Date();
  const ids = previous.map((process) => process._id);
  await Model("ProcessoFatura").updateMany({ ...filter, _id: { $in: ids } }, {
    $set: {
      etapa: "Arquivado",
      status: "arquivado",
      concluidoEm: now,
      alerta: "Arquivado automaticamente após nova entrada da OS na etapa de geração.",
    },
  });
  await Model("EventoProcesso").insertMany(previous.map((process) => ({
    tenantId: String(base.tenantId),
    processoId: process._id,
    etapa: "Arquivado",
    tentativa: Number(process.tentativas || 0) + 1,
    resultado: "ignorado",
    iniciadoEm: now,
    finalizadoEm: now,
    duracaoMs: 0,
    usuarioId: "webhook-omie",
    mensagem: "Processo anterior não enviado arquivado por nova entrada da OS na etapa de geração.",
    detalhes: { substituidoPor: String(currentProcessId), eventId: normalized.eventId },
  })));
  return previous.length;
}

async function createProcess({ base, mapping, trigger, normalized }) {
  const key = hash([
    "invoice", base.tenantId, base._id, normalized.codigoOs, trigger._id, normalized.eventId,
  ].join(":"));
  const existing = await findProcessByIdempotencyKey(key, base.tenantId);
  if (existing) {
    const archived = await archivePreviousUnsentProcesses({ base, trigger, normalized, currentProcessId: existing._id });
    return { process: existing, duplicate: true, archived };
  }
  try {
    const process = await Model("ProcessoFatura").create({
      tenantId: String(base.tenantId),
      baseOmieId: base._id,
      gatilhoId: trigger._id,
      gatilhoBaseId: mapping._id,
      idempotencyKey: key,
      eventoExternoId: normalized.eventId,
      codigoOs: normalized.codigoOs,
      numeroOs: normalized.numeroOs,
      etapa: "Aprovar processamento",
      status: "ativo",
      iniciadoEm: new Date(),
    });
    await Model("EventoProcesso").create({
      tenantId: String(base.tenantId),
      processoId: process._id,
      etapa: "Aprovar processamento",
      tentativa: 1,
      resultado: "iniciado",
      iniciadoEm: new Date(),
      finalizadoEm: new Date(),
      duracaoMs: 0,
      usuarioId: "webhook-omie",
      mensagem: "Processo criado por alteracao de etapa da OS.",
      detalhes: { eventId: normalized.eventId, topic: normalized.topic },
    });
    const archived = await archivePreviousUnsentProcesses({ base, trigger, normalized, currentProcessId: process._id });
    return { process, duplicate: false, archived };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const process = await findProcessByIdempotencyKey(key, base.tenantId);
    if (!process) {
      throw new GenericError("Conflito ao registrar o processo do webhook. A entrega pode ser repetida com segurança.", {
        statusCode: 409,
        code: "WEBHOOK_PROCESS_CONFLICT",
      });
    }
    const archived = await archivePreviousUnsentProcesses({ base, trigger, normalized, currentProcessId: process._id });
    return { process, duplicate: true, archived };
  }
}

async function receiveWebhook(token, payload) {
  const base = await resolveBaseByWebhookToken(token);
  if (!base) throw new GenericError("Webhook nao autorizado.", { statusCode: 401, code: "WEBHOOK_UNAUTHORIZED" });
  const normalized = normalizeWebhook(payload);
  const ticket = await integrationTickets.start({
    tenantId: base.tenantId,
    provider: "omie",
    operacao: "webhook.receive",
    baseOmieId: base._id,
    requisicao: { topic: normalized.topic, eventId: normalized.eventId, codigoOs: normalized.codigoOs, numeroOs: normalized.numeroOs, etapa: normalized.etapa },
  });
  try {
    let response;
    if (normalized.ping) {
      response = { ping: true, accepted: true, ignored: true, message: "pong", processes: [] };
    } else if (!isOsStageEvent(normalized.topic)) {
      // Mesmo contrato do backend legado: token válido e tópico não suportado
      // são uma entrega válida, mas sem efeito operacional.
      response = { accepted: true, ignored: true, reason: "topico-ignorado", message: "Tópico ignorado.", processes: [] };
    } else {
      if (!normalized.appKey || !await verifyWebhookAppKey(base, normalized.appKey)) {
        throw new GenericError("App Key do webhook nao corresponde a base configurada.", {
          statusCode: 401,
          code: "WEBHOOK_APP_KEY_MISMATCH",
        });
      }
      if (!normalized.codigoOs || !normalized.etapa) {
        throw new GenericError("Webhook de OS sem codigo ou etapa.", { statusCode: 422, code: "WEBHOOK_PAYLOAD_INVALID" });
      }
      const mappings = await Model("GatilhoBase").find({
        tenantId: base.tenantId,
        baseOmieId: base._id,
        etapaEnvio: normalized.etapa,
        status: "ativo",
      });
      const results = [];
      for (const mapping of mappings) {
        const trigger = await Model("Gatilho").findOne({ _id: mapping.gatilhoId, tenantId: base.tenantId, status: "ativo", tipoDocumento: "ordem-servico" });
        if (!trigger) continue;
        const result = await createProcess({ base, mapping, trigger, normalized });
        if (!result.process?._id) {
          throw new GenericError("Processo do webhook nao foi persistido.", {
            statusCode: 503,
            code: "WEBHOOK_PROCESS_NOT_PERSISTED",
          });
        }
        results.push({ id: String(result.process._id), duplicate: result.duplicate, archived: result.archived });
      }
      response = {
        accepted: true,
        ignored: results.length === 0,
        reason: results.length ? undefined : "etapa-sem-gatilho",
        message: results.length ? "Webhook recebido. Processo registrado." : "Etapa ignorada.",
        processes: results,
      };
    }
    await integrationTickets.success(ticket, { resposta: response, codigoExterno: normalized.eventId, mensagem: response.message });
    return response;
  } catch (error) {
    await integrationTickets.failure(ticket, error);
    throw error;
  }
}

module.exports = { archivePreviousUnsentProcesses, canonical, createProcess, findProcessByIdempotencyKey, isOsStageEvent, matchesAppKeyMask, normalizeWebhook, receiveWebhook, verifyWebhookAppKey };
