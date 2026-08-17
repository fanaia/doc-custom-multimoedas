"use strict";

const { GenericError, registry } = require("@oondemand/oon-core-back");
const gateway = require("./integrations/omieGateway");
const { resolveTenantCurrencies } = require("./currencies");
const { resolvedConfigurations } = require("./configuration");

function assertOsContract(os) {
  const missing = [];
  if (!os?.Cabecalho?.nCodOS) missing.push("os.Cabecalho.nCodOS");
  if (!os?.Cabecalho?.cNumOS) missing.push("os.Cabecalho.cNumOS");
  if (!os?.Cabecalho?.nCodCli) missing.push("os.Cabecalho.nCodCli");
  if (!Array.isArray(os?.ServicosPrestados)) missing.push("os.ServicosPrestados");
  if (!os?.InfoCadastro?.dDtInc) missing.push("os.InfoCadastro.dDtInc");
  if (missing.length) {
    throw new GenericError(`Resposta parcial da Omie. Campos ausentes: ${missing.join(", ")}.`, {
      statusCode: 422,
      code: "OMIE_OS_PARTIAL_RESPONSE",
    });
  }
}

function normalizeOs(os) {
  return {
    ...os,
    Observacoes: { cObsOS: "", ...(os.Observacoes || {}) },
    InformacoesAdicionais: { ...(os.InformacoesAdicionais || {}) },
    Email: { cEnviarPara: "", ...(os.Email || {}) },
    Parcelas: Array.isArray(os.Parcelas) ? os.Parcelas : [],
    despesasReembolsaveis: {
      ...(os.despesasReembolsaveis || {}),
      despesaReembolsavel: Array.isArray(os?.despesasReembolsaveis?.despesaReembolsavel)
        ? os.despesasReembolsaveis.despesaReembolsavel
        : [],
    },
  };
}

async function buildVariables({ tenantId, base, codigoOs, numeroOs, processoId, accessContext, adapters = {} }) {
  const omie = adapters.gateway || gateway;
  const omieOptions = { ...adapters, processoId: adapters.processoId || processoId };
  let osRaw;
  if (codigoOs) {
    try {
      osRaw = await omie.consultarOs(base, accessContext, codigoOs, omieOptions);
    } catch (error) {
      // Processos criados antes da separação dos identificadores podem ter o
      // número público salvo em codigoOs. Reconsulta por número para recuperá-los.
      if (numeroOs || error?.code !== "OMIE_API_ERROR") throw error;
      osRaw = await omie.consultarOsPorNumero(base, accessContext, codigoOs, omieOptions);
    }
  } else {
    osRaw = await omie.consultarOsPorNumero(base, accessContext, numeroOs, omieOptions);
  }
  assertOsContract(osRaw);
  const os = normalizeOs(osRaw);
  const cliente = await omie.consultarCliente(base, accessContext, os.Cabecalho.nCodCli, omieOptions);
  if (!cliente) throw new GenericError("Cliente da OS nao retornado pela Omie.", { statusCode: 422 });
  cliente.pais = await omie.consultarPais(base, accessContext, cliente.codigo_pais, omieOptions);

  const [moedas, configuracoes, imagens] = await Promise.all([
    (adapters.resolveCurrencies || resolveTenantCurrencies)(tenantId, processoId, adapters),
    resolvedConfigurations(tenantId, base._id),
    registry.getModel("Imagem").mongooseModel.find({ tenantId, status: "ativo" }).select("+conteudo").lean(),
  ]);
  const includes = imagens.map((item) => ({
    codigo: item.codigo,
    descricao: item.descricao || "",
    conteudo: item.conteudo,
    contentType: item.contentType,
    nomeArquivo: item.nomeArquivo,
    tamanho: item.tamanho,
    status: item.status,
  }));
  return {
    os,
    cliente,
    baseOmie: {
      _id: String(base._id), codigo: base.codigo, nome: base.nome, cnpj: base.cnpj,
      ambiente: base.ambiente, status: base.status,
    },
    moedas,
    configuracoes,
    includes,
  };
}

module.exports = { assertOsContract, buildVariables, normalizeOs };
