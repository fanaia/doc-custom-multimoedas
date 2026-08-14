"use strict";

const { defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "ArtefatoPdf",
  singular: "artefato-pdf",
  basePath: "/artefatos-pdf",
  schema: {
    processoId: fields.ref("ProcessoFatura", { required: true, label: "Processo" }),
    nomeArquivo: fields.string({ required: true, label: "Arquivo", searchable: true }),
    hash: fields.string({ required: true, label: "SHA-256", searchable: true }),
    tamanho: fields.number({ required: true, label: "Tamanho" }),
    conteudoBase64: { type: String, required: true, select: false },
    templateCodigo: fields.string({ required: true, label: "Template" }),
    templateVersao: fields.number({ required: true, label: "Versao" }),
    htmlSnapshot: { type: String, required: true, select: false },
    geradoEm: fields.date({ required: true, label: "Gerado em", default: Date.now }),
  },
  crud: {
    enabled: true,
    populateRefs: ["processoId"],
    permissions: { read: "process.read", write: "process.system" },
  },
}, [
  [{ tenantId: 1, processoId: 1 }, { unique: true }],
  [{ tenantId: 1, hash: 1 }, {}],
]);
