"use strict";

const { defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "CotacaoMoeda",
  singular: "cotacao-moeda",
  basePath: "/cotacoes-moedas",
  schema: {
    moedaId: fields.ref("Moeda", { required: true, label: "Moeda" }),
    processoId: fields.ref("ProcessoFatura", { label: "Processo" }),
    valor: fields.number({ required: true, label: "Valor" }),
    referenciaEm: fields.date({ required: true, label: "Referencia" }),
    consultadaEm: fields.date({ required: true, label: "Consulta" }),
    origem: fields.enum(["bacen", "historico", "contingencia", "fixa"], { required: true, label: "Origem" }),
    alerta: fields.string({ label: "Alerta" }),
  },
  crud: {
    enabled: true,
    populateRefs: true,
    permissions: { read: "currencies.read", write: "process.system" },
  },
}, [[{ tenantId: 1, moedaId: 1, consultadaEm: -1 }, {}]]);
