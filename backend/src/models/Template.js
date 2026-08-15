"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "Template",
  singular: "template",
  basePath: "/templates",
  schema: {
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    descricao: fields.string({ required: true, label: "Descricao", searchable: true }),
    tipo: fields.enum(["documento", "assunto", "corpo-email"], { required: true, label: "Tipo" }),
    versao: fields.number({ required: true, label: "Versao", default: 1 }),
    contratoVariaveis: fields.enum(["legacy-v1", "native-v2"], {
      required: true,
      label: "Contrato de variaveis",
      default: "legacy-v1",
    }),
    conteudo: fields.string({ required: true, label: "Conteudo EJS", searchable: false }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    permissions: { read: "templates.read", write: "templates.manage" },
  },
}, [[{ tenantId: 1, codigo: 1, tipo: 1, versao: 1 }, { unique: true }]]);
