"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "Gatilho",
  singular: "gatilho",
  basePath: "/gatilhos",
  schema: {
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    descricao: fields.string({ required: true, label: "Descricao", searchable: true }),
    tipoDocumento: fields.enum(["ordem-servico"], {
      required: true,
      label: "Documento Omie",
      default: "ordem-servico",
    }),
    templateDocumentoId: fields.ref("Template", { required: true, label: "Template da fatura" }),
    templateAssuntoId: fields.ref("Template", { required: true, label: "Template do assunto" }),
    templateCorpoId: fields.ref("Template", { required: true, label: "Template do corpo" }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    populateRefs: true,
    permissions: { read: "triggers.read", write: "triggers.manage" },
  },
}, [[{ tenantId: 1, codigo: 1 }, { unique: true }]]);
