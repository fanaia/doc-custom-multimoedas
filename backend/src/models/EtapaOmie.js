"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "EtapaOmie",
  singular: "etapa-omie",
  basePath: "/etapas-omie",
  schema: {
    baseOmieId: fields.ref("BaseOmie", { required: true, label: "Base Omie" }),
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    descricao: fields.string({ required: true, label: "Descricao", searchable: true }),
    sincronizadaEm: fields.date({ required: true, label: "Sincronizada em" }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    populateRefs: ["baseOmieId"],
    permissions: { read: "bases.read", write: "process.system" },
  },
}, [[{ tenantId: 1, baseOmieId: 1, codigo: 1 }, { unique: true }]]);
