"use strict";

const { defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "IntegracaoTicket",
  singular: "ticket-integracao",
  basePath: "/tickets-integracao",
  schema: {
    provider: fields.enum(["omie", "sendgrid"], { required: true, label: "Integração" }),
    operacao: fields.string({ required: true, label: "Operação", searchable: true }),
    baseOmieId: fields.ref("BaseOmie", { label: "Base Omie" }),
    processoId: fields.ref("ProcessoFatura", { label: "Processo" }),
    status: fields.enum(["processando", "sucesso", "falha"], { required: true, label: "Status" }),
    tentativa: fields.number({ required: true, label: "Tentativa", default: 1 }),
    requisicao: { type: Object, default: {} },
    resposta: { type: Object, default: {} },
    codigoExterno: fields.string({ label: "Código externo" }),
    codigoErro: fields.string({ label: "Código do erro" }),
    mensagem: fields.string({ label: "Mensagem" }),
    iniciadoEm: fields.date({ required: true, label: "Início", default: Date.now }),
    finalizadoEm: fields.date({ label: "Fim" }),
    duracaoMs: fields.number({ label: "Duração (ms)" }),
  },
  crud: {
    enabled: true,
    populateRefs: ["baseOmieId", "processoId"],
    permissions: { read: "audit.read", write: "process.system" },
  },
}, [[{ tenantId: 1, iniciadoEm: -1 }, {}]]);
