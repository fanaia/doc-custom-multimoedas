"use strict";

const AUTOMATION_DEFINITIONS = [
  { code: "automacao-aprovacao-automatica", label: "Aprovação automática" },
  { code: "automacao-revisao-automatica", label: "Revisão automática" },
  { code: "automacao-envio-automatico", label: "Envio automático" },
  { code: "automacao-reprocessar-falha", label: "Reprocessar falha automático" },
];
const AUTOMATION_CODES = new Set(AUTOMATION_DEFINITIONS.map((item) => item.code));

const { registry } = require("@oondemand/oon-core-back");

function parseValue(item) {
  const value = item.valor;
  if (item.tipo === "numero") return Number(value);
  if (item.tipo === "booleano") return String(value).toLowerCase() === "true";
  if (item.tipo === "lista-emails") return String(value || "").split(/[;,\n]+/).map((entry) => entry.trim()).filter(Boolean);
  return value;
}

async function resolvedConfigurations(tenantId, baseOmieId) {
  const Model = registry.getModel("Configuracao").mongooseModel;
  const items = await Model.find({
    tenantId,
    status: "ativo",
    $or: [{ baseOmieId: null }, { baseOmieId: { $exists: false } }, { baseOmieId }],
  }).lean();
  const resolved = new Map();
  items.filter((item) => !item.baseOmieId).forEach((item) => resolved.set(item.codigo, item));
  items.filter((item) => String(item.baseOmieId) === String(baseOmieId)).forEach((item) => resolved.set(item.codigo, item));
  const legacy = [...resolved.values()].map((item) => ({
    codigo: item.codigo,
    descricao: item.descricao,
    tipo: item.tipo,
    // O EJS legado recebe o valor persistido, normalmente uma string.
    valor: item.valor,
    valorTipado: parseValue(item),
    baseOmie: item.baseOmieId || null,
    baseOmieId: item.baseOmieId || null,
    status: item.status,
    origem: item.baseOmieId ? "base" : "global",
  }));
  const { FIELDS, resolvedTypedConfigurations } = require("./europartnerSettings");
  const typedCodes = new Set(Object.values(FIELDS).map(([code]) => code));
  const typed = await resolvedTypedConfigurations(tenantId, baseOmieId);
  const migratedCodes = new Set(typed.map(item => item.codigo));
  if (legacy.some(item => typedCodes.has(item.codigo) && (!migratedCodes.has(item.codigo)
      || (item.baseOmieId && !typed.some(candidate => candidate.codigo === item.codigo && String(candidate.baseOmieId) === String(item.baseOmieId)))))) {
    const { GenericError } = require("@oondemand/oon-core-back");
    throw new GenericError("Migre as características existentes para o model Europartner antes de executar a esteira.", { statusCode: 409, code: "EUROPARTNER_SETTINGS_MIGRATION_REQUIRED" });
  }
  return [...legacy.filter(item => !typedCodes.has(item.codigo)), ...typed];
}

function automationSettingsFromConfigurations(configurations = []) {
  return Object.fromEntries(AUTOMATION_DEFINITIONS.map(({ code }) => [
    code,
    Boolean(getConfiguration(configurations, code, false)),
  ]));
}

async function automationSettings(tenantId, baseOmieId) {
  return automationSettingsFromConfigurations(await resolvedConfigurations(tenantId, baseOmieId));
}

function getConfiguration(configurations, code, fallback = undefined) {
  const item = configurations.find((candidate) => candidate.codigo === code);
  return item ? (item.valorTipado ?? parseValue(item)) : fallback;
}

module.exports = { AUTOMATION_CODES, AUTOMATION_DEFINITIONS, automationSettings, automationSettingsFromConfigurations, getConfiguration, parseValue, resolvedConfigurations };
