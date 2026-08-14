"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "Configuracao",
  singular: "configuracao",
  basePath: "/configuracoes",
  schema: {
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    descricao: fields.string({ required: true, label: "Descricao", searchable: true }),
    tipo: fields.enum(["texto", "numero", "booleano", "email", "lista-emails", "html"], {
      label: "Tipo",
      default: "texto",
    }),
    valor: fields.string({ required: true, label: "Valor", searchable: false }),
    baseOmieId: fields.ref("BaseOmie", { label: "Base Omie" }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    populateRefs: ["baseOmieId"],
    permissions: { read: "settings.read", write: "settings.manage" },
  },
}, [[{ tenantId: 1, baseOmieId: 1, codigo: 1 }, { unique: true }]]);
