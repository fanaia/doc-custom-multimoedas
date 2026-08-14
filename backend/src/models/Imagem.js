"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "Imagem",
  singular: "imagem",
  basePath: "/imagens",
  schema: {
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    descricao: fields.string({ required: true, label: "Descricao", searchable: true }),
    nomeArquivo: fields.string({ required: true, label: "Arquivo" }),
    contentType: fields.enum(["image/png", "image/jpeg", "image/gif", "image/webp"], {
      required: true,
      label: "MIME type",
    }),
    tamanho: { ...fields.number({ required: true, label: "Tamanho (bytes)" }), readonly: true },
    conteudo: { type: String, required: true, select: false },
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    permissions: { read: "templates.read", write: "templates.manage" },
  },
}, [[{ tenantId: 1, codigo: 1 }, { unique: true }]]);
