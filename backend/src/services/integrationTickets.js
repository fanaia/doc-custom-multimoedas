"use strict";

const { registry } = require("@oondemand/oon-core-back");
const { errorSummary } = require("./sanitization");

function Ticket() { return registry.getModel("IntegracaoTicket").mongooseModel; }

function safe(value) {
  if (Array.isArray(value)) return value.map(safe);
  if (!value || typeof value !== "object") return value;
  const hidden = new Set(["app_key", "app_secret", "apikey", "authorization", "content", "carquivo"]);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, hidden.has(key.toLowerCase()) ? "[REDACTED]" : safe(item)]));
}

async function start({ tenantId, provider, operacao, baseOmieId, processoId, requisicao }) {
  return Ticket().create({ tenantId: String(tenantId), provider, operacao, baseOmieId, processoId, requisicao: safe(requisicao), status: "processando", iniciadoEm: new Date() });
}

async function success(ticket, { resposta, codigoExterno } = {}) {
  if (!ticket) return;
  const now = new Date();
  await Ticket().updateOne({ _id: ticket._id, tenantId: ticket.tenantId }, { $set: { status: "sucesso", resposta: safe(resposta), codigoExterno: String(codigoExterno || ""), finalizadoEm: now, duracaoMs: now.getTime() - new Date(ticket.iniciadoEm).getTime() } });
}

async function failure(ticket, error) {
  if (!ticket) return;
  const now = new Date(); const summary = errorSummary(error);
  await Ticket().updateOne({ _id: ticket._id, tenantId: ticket.tenantId }, { $set: { status: "falha", codigoErro: summary.code, mensagem: summary.message, finalizadoEm: now, duracaoMs: now.getTime() - new Date(ticket.iniciadoEm).getTime() } });
}

module.exports = { failure, start, success };
