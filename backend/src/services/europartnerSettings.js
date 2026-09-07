"use strict";

const { GenericError, registry } = require("@oondemand/oon-core-back");

// Contract derived from invoice-os-v1.html and invoiceWorkflow.js, not customer data.
const FIELDS = Object.freeze({
  razaoSocial: ["razao-social", "texto"], enderecoLinha1: ["endereco-linha1", "texto"],
  enderecoLinha2: ["endereco-linha2", "texto"], cidade: ["cidade", "texto"],
  banco: ["pagamento-banco", "texto"], agencia: ["pagamento-agencia", "texto"],
  contaCorrente: ["pagamento-cc", "texto"], swift: ["pagamento-swift", "texto"], iban: ["pagamento-iban", "texto"],
  emailFrom: ["email-from", "email"], emailFromNome: ["email-from-nome", "texto"],
  emailCc: ["email-cc", "lista-emails"], emailCopia: ["email-copia", "lista-emails"],
  emailBcc: ["email-bcc", "lista-emails"], destinatariosInternos: ["email-destinatarios-internos", "lista-emails"],
  aprovacaoAutomatica: ["automacao-aprovacao-automatica", "booleano"],
  revisaoAutomatica: ["automacao-revisao-automatica", "booleano"],
  envioAutomatico: ["automacao-envio-automatico", "booleano"],
  reprocessarFalha: ["automacao-reprocessar-falha", "booleano"],
});
const byCode = new Map(Object.entries(FIELDS).map(([field, [code, type]]) => [code, { field, type }]));
function fail(field) { throw new GenericError(`Característica Europartner inválida: ${field}.`, { statusCode: 422, code: "EUROPARTNER_SETTINGS_INVALID" }); }
function validateField(field, value) {
  if (value == null) return;
  const type = FIELDS[field]?.[1];
  if (!type) fail(field);
  if (type === "booleano") { if (typeof value !== "boolean") fail(field); return; }
  if (type === "lista-emails") {
    if (!Array.isArray(value) || value.length > 100 || value.some(email => typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) fail(field);
    return;
  }
  if (typeof value !== "string" || value.length > 300 || /[\x00-\x1f\x7f]/.test(value)) fail(field);
  if (type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail(field);
}
function validateSettings(data) {
  for (const field of Object.keys(FIELDS)) validateField(field, data[field]);
}
function legacyValue(item, field, type) {
  const raw = String(item.valor ?? "");
  let value = raw;
  if (type === "booleano") { if (!["true", "false"].includes(raw.toLowerCase())) fail(field); value = raw.toLowerCase() === "true"; }
  if (type === "lista-emails") value = raw.split(/[;,\n]+/).map(value => value.trim()).filter(Boolean);
  validateField(field, value); return value;
}
function migrationRecords(tenantId, configurations) {
  const records = new Map(); const unmapped = [];
  for (const item of configurations) {
    if (item.status !== "ativo") continue;
    const definition = byCode.get(item.codigo);
    if (!definition) { unmapped.push(item.codigo); continue; }
    const key = String(item.baseOmieId || "global");
    const record = records.get(key) || { tenantId, baseOmieId: item.baseOmieId || null, contractVersion: 1, status: "ativo" };
    if (Object.hasOwn(record, definition.field)) fail(definition.field);
    record[definition.field] = legacyValue(item, definition.field, definition.type);
    records.set(key, record);
  }
  return { records: [...records.values()], unmapped: [...new Set(unmapped)] };
}
function resolveRecords(records, baseOmieId) {
  const result = new Map();
  const scoped = [...records.filter(row => !row.baseOmieId), ...records.filter(row => String(row.baseOmieId) === String(baseOmieId))];
  for (const row of scoped) {
    if (row.status !== "ativo") continue;
    for (const [field, [codigo, tipo]] of Object.entries(FIELDS)) {
      if (row[field] == null) continue; // false, [] and empty string are explicit overrides.
      validateField(field, row[field]);
      const valorTipado = row[field];
      result.set(codigo, { codigo, tipo, descricao: field, valor: Array.isArray(valorTipado) ? valorTipado.join(";") : String(valorTipado), valorTipado,
        baseOmieId: row.baseOmieId || null, baseOmie: row.baseOmieId || null, status: "ativo", origem: row.baseOmieId ? "base" : "global" });
    }
  }
  return [...result.values()];
}
async function resolvedTypedConfigurations(tenantId, baseOmieId) {
  const rows = await registry.getModel("EuropartnerSettings").mongooseModel.find({ tenantId, status: "ativo", $or: [{ baseOmieId: null }, ...(baseOmieId ? [{ baseOmieId }] : [])] }).lean();
  return resolveRecords(rows, baseOmieId);
}
async function migrate(accessContext, { apply = false } = {}) {
  const tenantId = accessContext.tenantId;
  if (!tenantId) throw new GenericError("Tenant obrigatório.", { statusCode: 403 });
  const source = await registry.getModel("Configuracao").mongooseModel.find({ tenantId }).lean();
  const result = migrationRecords(tenantId, source);
  const Model = registry.getModel("EuropartnerSettings").mongooseModel;
  const conflicts = [];
  for (const row of result.records) {
    if (row.baseOmieId && !await registry.getModel("BaseOmie").mongooseModel.exists({ _id: row.baseOmieId, tenantId })) throw new GenericError("Base fora do tenant.", { statusCode: 403, code: "TENANT_REFERENCE_DENIED" });
    const existing = await Model.findOne({ tenantId, baseOmieId: row.baseOmieId }).lean();
    if (existing && Object.keys(FIELDS).some(field => row[field] != null && JSON.stringify(row[field]) !== JSON.stringify(existing[field]))) conflicts.push(String(row.baseOmieId || "global"));
  }
  if (apply && conflicts.length) throw new GenericError("Migração conflita com características já editadas. Revise antes de aplicar.", { statusCode: 409, code: "EUROPARTNER_MIGRATION_CONFLICT" });
  if (apply) for (const row of result.records) {
    await Model.updateOne({ tenantId, baseOmieId: row.baseOmieId }, { $setOnInsert: row }, { upsert: true, runValidators: true });
    const stored = await Model.findOne({ tenantId, baseOmieId: row.baseOmieId }).lean();
    if (Object.keys(FIELDS).some(field => row[field] != null && JSON.stringify(row[field]) !== JSON.stringify(stored?.[field]))) throw new GenericError("Características foram alteradas durante a migração. Execute a conferência novamente.", { statusCode: 409, code: "EUROPARTNER_MIGRATION_CONFLICT" });
  }
  // Never return settings values in migration reports; the legacy records are retained.
  return { applied: apply, scopes: result.records.map(row => ({ baseOmieId: row.baseOmieId, fields: Object.keys(FIELDS).filter(field => row[field] != null) })), unmapped: result.unmapped, conflicts };
}
module.exports = { FIELDS, validateSettings, validateField, migrationRecords, resolveRecords, resolvedTypedConfigurations, migrate };
