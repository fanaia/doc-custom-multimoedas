"use strict";

const crypto = require("node:crypto");
const { GenericError } = require("@oondemand/oon-core-back");
const { credentialsFor } = require("../baseCredentials");
const tickets = require("../integrationTickets");
const { zipSingleFile } = require("../zipFile");

const BASE_URL = "https://app.omie.com.br/api/v1";

function externalError(call, response, data) {
  const message = data?.faultstring || data?.message || `HTTP ${response.status}`;
  return new GenericError(`Omie ${call}: ${String(message).slice(0, 500)}`, {
    statusCode: response.status >= 500 ? 502 : 422,
    code: "OMIE_API_ERROR",
  });
}

async function call(baseOrId, accessContext, endpoint, callName, param, options = {}) {
  const { base, appKey, appSecret } = await credentialsFor(baseOrId, accessContext);
  if (base.status !== "ativo" && options.allowInactive !== true) {
    throw new GenericError("Base Omie inativa.", { statusCode: 422, code: "OMIE_BASE_INACTIVE" });
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const ticket = options.skipTicket ? null : await tickets.start({ tenantId: base.tenantId || accessContext.tenantId, provider: "omie", operacao: callName, baseOmieId: base._id, processoId: options.processoId, requisicao: { endpoint, param } });
  try {
    const response = await fetchImpl(`${String(options.baseUrl || BASE_URL).replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ call: callName, app_key: appKey, app_secret: appSecret, param: Array.isArray(param) ? param : [param] }),
      signal: AbortSignal.timeout(Number(options.timeoutMs || 15_000)),
    });
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok || data?.faultstring) throw externalError(callName, response, data);
    await tickets.success(ticket, { resposta: { httpStatus: response.status } });
    return data;
  } catch (error) {
    await tickets.failure(ticket, error);
    throw error;
  }
}

function testConnection(baseOrId, accessContext, options) {
  return call(baseOrId, accessContext, "geral/empresas/", "ListarEmpresas", {
    pagina: 1,
    registros_por_pagina: 1,
    apenas_importado_api: "N",
  }, { ...options, allowInactive: true });
}

function consultarOs(base, accessContext, codigoOs, options) {
  return call(base, accessContext, "servicos/os/", "ConsultarOS", { nCodOS: Number(codigoOs) }, options);
}

function consultarOsPorNumero(base, accessContext, numeroOs, options) {
  return call(base, accessContext, "servicos/os/", "ConsultarOS", { cNumOS: String(numeroOs) }, options);
}

function consultarCliente(base, accessContext, codigoCliente, options) {
  return call(base, accessContext, "geral/clientes/", "ConsultarCliente", { codigo_cliente_omie: Number(codigoCliente) }, options);
}

async function consultarPais(base, accessContext, codigoPais, options) {
  if (String(codigoPais) === "1058") return "Brasil";
  const data = await call(base, accessContext, "geral/paises/", "ListarPaises", { filtrar_por_codigo: codigoPais }, options);
  return data?.lista_paises?.[0]?.cDescricao || "";
}

function normalizeOperationDescription(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function parseServiceStages(data) {
  const map = new Map();
  for (const operation of data?.cadastros || data?.etapas || []) {
    const isServiceSale = String(operation?.cCodOperacao || "") === "01"
      || normalizeOperationDescription(operation?.cDescOperacao).includes("venda de servico");
    if (!isServiceSale) continue;
    for (const stage of operation.etapas || []) {
      if (stage?.cInativo === "S" || !stage?.cCodigo) continue;
      const description = stage.cDescricao || stage.cDescrPadrao || stage.cCodigo;
      const current = map.get(stage.cCodigo);
      map.set(stage.cCodigo, current && current !== description ? `${current} - ${description}` : description);
    }
  }
  return [...map.entries()].map(([codigo, descricao]) => ({ codigo, descricao }));
}

async function listarEtapas(base, accessContext, options) {
  const data = await call(base, accessContext, "produtos/etapafat/", "ListarEtapasFaturamento", {
    pagina: 1,
    registros_por_pagina: 900,
  }, options);
  return parseServiceStages(data);
}

async function listarCategorias(base, accessContext, options) {
  const data = await call(base, accessContext, "geral/categorias/", "ListarCategorias", {
    pagina: 1, registros_por_pagina: 900,
  }, options);
  return (data?.categoria_cadastro || [])
    .filter((item) => item?.nao_exibir !== "S")
    .map((item) => ({ codigo: String(item.codigo || ""), descricao: item.descricao || item.codigo }))
    .filter((item) => item.codigo);
}

async function listarContasCorrentes(base, accessContext, options) {
  const data = await call(base, accessContext, "geral/contacorrente/", "ListarContasCorrentes", {
    pagina: 1, registros_por_pagina: 900, apenas_importado_api: "N",
  }, options);
  return (data?.ListarContasCorrentes || [])
    .map((item) => ({ codigo: Number(item.nCodCC), descricao: item.descricao || item.codigo_banco || String(item.nCodCC), banco: item.codigo_banco || "", inativo: item.inativo === "S" }))
    .filter((item) => Number.isFinite(item.codigo) && item.codigo > 0);
}

async function incluirPdf(base, accessContext, os, filename, pdf, options) {
  const zip = zipSingleFile(filename, pdf);
  const documentKey = crypto.createHash("sha256").update(pdf).digest("hex").slice(0, 40);
  return call(base, accessContext, "geral/anexo/", "IncluirAnexo", {
    cCodIntAnexo: `doc-custom-${documentKey}`,
    cTabela: "ordem-servico",
    nId: Number(os.Cabecalho.nCodOS),
    cNomeArquivo: filename,
    cTipoArquivo: "pdf",
    cArquivo: zip.toString("base64"),
    cMd5: crypto.createHash("md5").update(zip).digest("hex"),
  }, options);
}

function listarAnexos(base, accessContext, codigoOs, options) {
  return call(base, accessContext, "geral/anexo/", "ListarAnexo", {
    nPagina: 1,
    nRegPorPagina: 100,
    nId: Number(codigoOs),
    cTabela: "ordem-servico",
  }, options);
}

function obterAnexo(base, accessContext, item, options) {
  return call(base, accessContext, "geral/anexo/", "ObterAnexo", {
    cTabela: item.cTabela || "ordem-servico",
    nId: Number(item.nId),
    nIdAnexo: Number(item.nIdAnexo),
  }, options);
}

function assertDownloadUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new GenericError("URL de anexo Omie insegura.", { statusCode: 422 });
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^(?:10|127|169\.254|192\.168)\./.test(hostname)) {
    throw new GenericError("URL de anexo Omie nao permitida.", { statusCode: 422 });
  }
  return url;
}

async function downloadAttachment(url, options = {}) {
  const response = await (options.fetchImpl || globalThis.fetch)(assertDownloadUrl(url), {
    signal: AbortSignal.timeout(Number(options.timeoutMs || 20_000)),
  });
  if (!response.ok) throw new GenericError(`Falha ao baixar anexo Omie (HTTP ${response.status}).`, { statusCode: 502 });
  return Buffer.from(await response.arrayBuffer());
}

async function atualizarEtapa(base, accessContext, os, etapa, observacao, options) {
  const current = os?.Cabecalho ? os : await consultarOs(base, accessContext, os, options);
  const existing = String(current?.Observacoes?.cObsOS || "");
  const appended = existing.includes(observacao) ? existing : [existing, observacao].filter(Boolean).join("\n");
  const header = { nCodOS: Number(current.Cabecalho.nCodOS), cEtapa: etapa };
  if (current.Cabecalho.dDtPrevisao) header.dDtPrevisao = current.Cabecalho.dDtPrevisao;
  if (current.Cabecalho.cCodParc) header.cCodParc = current.Cabecalho.cCodParc;
  return call(base, accessContext, "servicos/os/", "AlterarOS", {
    Cabecalho: header,
    Observacoes: { cObsOS: appended },
  }, options);
}

module.exports = {
  atualizarEtapa,
  call,
  consultarCliente,
  consultarOs,
  consultarOsPorNumero,
  consultarPais,
  downloadAttachment,
  incluirPdf,
  listarAnexos,
  listarCategorias,
  listarContasCorrentes,
  listarEtapas,
  obterAnexo,
  parseServiceStages,
  testConnection,
};
