"use strict";

const { GenericError } = require("@oondemand/oon-core-back");

const LEGACY_V1 = "legacy-v1";
const NATIVE_V2 = "native-v2";
const SUPPORTED_CONTRACTS = [LEGACY_V1, NATIVE_V2];

function contractVersion(template) {
  return template?.contratoVariaveis || LEGACY_V1;
}

function referencedIncludeCodes(content) {
  const codes = new Set();
  const pattern = /includes\s*\.\s*find\s*\([^)]*?\.codigo\s*={2,3}\s*(["'])([^"']+)\1[^)]*\)/g;
  for (const match of String(content || "").matchAll(pattern)) codes.add(match[2]);
  return [...codes];
}

function legacyIncludes(template, includes = []) {
  const mapped = includes.map((item) => ({
    codigo: item.codigo,
    descricao: item.descricao || "",
    conteudo: item.conteudo || "",
    contenType: item.contenType || item.contentType || "application/octet-stream",
    contentType: item.contentType || item.contenType || "application/octet-stream",
    status: item.status,
  }));
  const existing = new Set(mapped.map((item) => item.codigo));
  for (const codigo of referencedIncludeCodes(template?.conteudo)) {
    if (existing.has(codigo)) continue;
    mapped.push({
      codigo,
      descricao: "Include ausente; substituido por conteudo vazio pelo contrato legacy-v1.",
      conteudo: "",
      contenType: "application/octet-stream",
      contentType: "application/octet-stream",
      status: "inativo",
      ausente: true,
    });
  }
  return mapped;
}

function legacyV1(template, variables) {
  const configuracoes = (variables.configuracoes || []).map((item) => ({
    codigo: item.codigo,
    descricao: item.descricao,
    tipo: item.tipo,
    valor: item.valor,
    baseOmie: item.baseOmie || item.baseOmieId || null,
    status: item.status,
  }));
  return {
    baseOmie: variables.baseOmie,
    includes: legacyIncludes(template, variables.includes),
    cliente: variables.cliente,
    os: variables.os,
    moedas: (variables.moedas || []).map((item) => ({
      simbolo: item.codigo || item.simbolo,
      tipoCotacao: item.tipoCotacao,
      valor: item.valor,
      status: item.status,
      cotacao: item.cotacao,
      valorFinal: item.valorFinal,
    })),
    configuracoes,
    caracteristicas: configuracoes,
  };
}

function nativeV2(variables) {
  return {
    ...variables,
    moedas: (variables.moedas || []).map((item) => ({
      ...item,
      simbolo: item.simboloMonetario || item.simbolo,
      valorFinal: Number(item.cotacao ?? item.valorFinal),
    })),
    configuracoes: (variables.configuracoes || []).map((item) => ({
      ...item,
      valor: item.valorTipado ?? item.valor,
    })),
    includes: (variables.includes || []).map(({ contenType, ...item }) => item),
  };
}

function variablesForTemplate(template, variables) {
  const version = contractVersion(template);
  if (version === LEGACY_V1) return legacyV1(template, variables);
  if (version === NATIVE_V2) return nativeV2(variables);
  throw new GenericError(`Contrato de variaveis nao suportado: ${version}.`, {
    statusCode: 422,
    code: "TEMPLATE_CONTRACT_UNSUPPORTED",
  });
}

module.exports = {
  LEGACY_V1,
  NATIVE_V2,
  SUPPORTED_CONTRACTS,
  contractVersion,
  referencedIncludeCodes,
  variablesForTemplate,
};
