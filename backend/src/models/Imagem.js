"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "Imagem",
  singular: "imagem",
  basePath: "/imagens",
  schema: {
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    descricao: fields.string({ required: true, label: "Descricao", searchable: true }),
    contentType: fields.enum(["image/png", "image/jpeg", "image/gif", "image/webp"], {
      required: true,
      label: "MIME type",
    }),
    tamanho: fields.number({ required: true, label: "Tamanho (bytes)" }),
    conteudo: fields.string({ required: true, label: "Conteudo Base64", searchable: false }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    permissions: { read: "templates.read", write: "templates.manage" },
  },
}, [[{ tenantId: 1, codigo: 1 }, { unique: true }]]);
