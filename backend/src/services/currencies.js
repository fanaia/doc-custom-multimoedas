"use strict";

const { GenericError, registry } = require("@oondemand/oon-core-back");

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function ptaxDate(date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}-${day}-${date.getUTCFullYear()}`;
}

async function fetchPtax(code, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now ? new Date(options.now) : new Date();
  let lastError;
  for (let days = 0; days < 30; days += 1) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - days);
    const formatted = ptaxDate(date);
    const endpoint = new URL("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)");
    endpoint.searchParams.set("@moeda", `'${String(code).toUpperCase()}'`);
    endpoint.searchParams.set("@dataCotacao", `'${formatted}'`);
    endpoint.searchParams.set("$top", "100");
    endpoint.searchParams.set("$format", "json");
    endpoint.searchParams.set("$select", "cotacaoCompra,cotacaoVenda,dataHoraCotacao,tipoBoletim");
    try {
      const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const quote = data?.value?.find((item) => item.tipoBoletim === "Fechamento PTAX") || data?.value?.at(-1);
      const value = positive(quote?.cotacaoCompra || quote?.cotacaoVenda);
      if (value) return { value, referenceDate: quote.dataHoraCotacao || date.toISOString(), raw: quote };
    } catch (error) {
      lastError = error;
      break;
    }
  }
  throw new GenericError(`Bacen indisponivel para ${code}: ${String(lastError?.message || "cotacao nao encontrada")}`, {
    statusCode: 503,
    code: "BACEN_UNAVAILABLE",
  });
}

async function resolveRate(currency, adapters = {}) {
  const now = adapters.now ? new Date(adapters.now) : new Date();
  if (currency.fonte === "fixa") {
    const value = positive(currency.valorFixo);
    if (!value) throw new GenericError(`Moeda ${currency.codigo} sem valor fixo valido.`, { statusCode: 422 });
    return { value, source: "fixa", referenceDate: now, queriedAt: now, warning: "" };
  }
  try {
    const quote = await (adapters.fetchPtax || fetchPtax)(currency.codigo, adapters);
    return { value: quote.value, source: "bacen", referenceDate: new Date(quote.referenceDate), queriedAt: now, warning: "" };
  } catch (bacenError) {
    const history = adapters.loadHistory ? await adapters.loadHistory(currency) : null;
    const historyValue = positive(history?.valor ?? history?.value ?? currency.ultimoValorValido);
    if (historyValue) {
      return {
        value: historyValue,
        source: "historico",
        referenceDate: new Date(history?.referenciaEm || history?.referenceDate || currency.ultimaReferenciaEm),
        queriedAt: now,
        warning: `Bacen indisponivel; usada a ultima cotacao valida de ${currency.codigo}.`,
      };
    }
    const contingency = positive(currency.valorContingencia);
    if (contingency) {
      return {
        value: contingency,
        source: "contingencia",
        referenceDate: now,
        queriedAt: now,
        warning: `Bacen indisponivel e sem historico; usada contingencia de ${currency.codigo}.`,
      };
    }
    throw new GenericError(`Moeda ${currency.codigo} sem cotacao, historico ou contingencia.`, {
      statusCode: 422,
      code: "CURRENCY_RATE_UNAVAILABLE",
      cause: bacenError,
    });
  }
}

function templateCurrency(currency, rate) {
  return {
    // Contrato historico dos templates: "simbolo" contem o codigo ISO.
    simbolo: currency.codigo,
    tipoCotacao: currency.fonte === "fixa" ? "valorFixo" : "cotacao",
    valor: currency.valorFixo,
    status: currency.status,
    cotacao: rate.value,
    valorFinal: Number(rate.value).toFixed(4),

    // Campos adicionais da implementacao atual, mantidos sem alterar o legado.
    codigo: currency.codigo,
    simboloMonetario: currency.simbolo || currency.codigo,
    fonte: rate.source,
    dataReferencia: rate.referenceDate,
    consultadaEm: rate.queriedAt,
    alerta: rate.warning,
  };
}

async function resolveTenantCurrencies(tenantId, processoId, adapters = {}) {
  const Currency = registry.getModel("Moeda").mongooseModel;
  const History = registry.getModel("CotacaoMoeda").mongooseModel;
  const currencies = await Currency.find({ tenantId, status: "ativo" }).lean();
  const output = [];
  for (const currency of currencies) {
    const rate = await resolveRate(currency, {
      ...adapters,
      loadHistory: async () => History.findOne({ tenantId, moedaId: currency._id, origem: "bacen" })
        .sort({ referenciaEm: -1 })
        .lean(),
    });
    await History.create({
      tenantId,
      moedaId: currency._id,
      processoId: processoId || undefined,
      valor: rate.value,
      referenciaEm: rate.referenceDate,
      consultadaEm: rate.queriedAt,
      origem: rate.source,
      alerta: rate.warning,
    });
    await Currency.updateOne({ _id: currency._id, tenantId }, {
      $set: {
        ultimoValorValido: rate.source === "bacen" ? rate.value : currency.ultimoValorValido,
        ultimaReferenciaEm: rate.referenceDate,
        ultimaConsultaEm: rate.queriedAt,
        ultimaOrigem: rate.source,
      },
    });
    output.push(templateCurrency(currency, rate));
  }
  return output;
}

module.exports = { fetchPtax, positive, ptaxDate, resolveRate, resolveTenantCurrencies, templateCurrency };
