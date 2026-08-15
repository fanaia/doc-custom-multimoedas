"use strict";

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
  return [...resolved.values()].map((item) => ({
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
}

function getConfiguration(configurations, code, fallback = undefined) {
  const item = configurations.find((candidate) => candidate.codigo === code);
  return item ? (item.valorTipado ?? parseValue(item)) : fallback;
}

module.exports = { getConfiguration, parseValue, resolvedConfigurations };
