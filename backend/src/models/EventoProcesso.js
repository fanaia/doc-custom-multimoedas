"use strict";

const { defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "EventoProcesso",
  singular: "evento-processo",
  basePath: "/eventos-processos",
  schema: {
    processoId: fields.ref("ProcessoFatura", { required: true, label: "Processo" }),
    etapa: fields.string({ required: true, label: "Etapa", searchable: true }),
    tentativa: fields.number({ required: true, label: "Tentativa", default: 1 }),
    resultado: fields.enum(["iniciado", "sucesso", "falha", "rejeitado", "ignorado"], {
      required: true,
      label: "Resultado",
    }),
    iniciadoEm: fields.date({ required: true, label: "Inicio", default: Date.now }),
    finalizadoEm: fields.date({ label: "Fim" }),
    duracaoMs: fields.number({ label: "Duracao (ms)" }),
    usuarioId: fields.string({ label: "Usuario" }),
    codigoErro: fields.string({ label: "Codigo do erro" }),
    mensagem: fields.string({ label: "Mensagem" }),
    detalhes: { type: Object, default: {} },
  },
  crud: {
    enabled: true,
    populateRefs: ["processoId"],
    permissions: { read: "audit.read", write: "process.system" },
  },
}, [[{ tenantId: 1, processoId: 1, createdAt: 1 }, {}]]);
