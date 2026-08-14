"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "Moeda",
  singular: "moeda",
  basePath: "/moedas",
  schema: {
    codigo: fields.currencyCode({ required: true, label: "Codigo ISO" }),
    simbolo: fields.string({ required: true, label: "Simbolo", searchable: true }),
    fonte: fields.enum(["bacen", "fixa"], { label: "Fonte", default: "bacen" }),
    valorFixo: fields.number({ label: "Valor fixo" }),
    valorContingencia: fields.number({ label: "Valor de contingencia" }),
    ultimoValorValido: fields.number({ label: "Ultima cotacao valida" }),
    ultimaReferenciaEm: fields.date({ label: "Data de referencia" }),
    ultimaConsultaEm: fields.date({ label: "Ultima consulta" }),
    ultimaOrigem: fields.enum(["bacen", "historico", "contingencia", "fixa", "nenhuma"], {
      label: "Ultima origem",
      default: "nenhuma",
    }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    permissions: { read: "currencies.read", write: "currencies.manage" },
  },
}, [[{ tenantId: 1, codigo: 1 }, { unique: true }]]);
