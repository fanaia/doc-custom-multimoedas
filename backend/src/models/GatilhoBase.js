"use strict";

const { businessStatus, defineTenantModel, fields } = require("./_shared");

defineTenantModel({
  name: "GatilhoBase",
  singular: "gatilho-base",
  basePath: "/gatilhos-bases",
  schema: {
    gatilhoId: fields.ref("Gatilho", { required: true, label: "Gatilho" }),
    baseOmieId: fields.ref("BaseOmie", { required: true, label: "Base Omie" }),
    etapaEnvio: fields.string({ required: true, label: "Etapa de envio", searchable: true }),
    etapaErro: fields.string({ required: true, label: "Etapa de erro", searchable: true }),
    etapaSucesso: fields.string({ required: true, label: "Etapa de sucesso", searchable: true }),
    status: businessStatus(),
  },
  crud: {
    enabled: true,
    populateRefs: true,
    permissions: { read: "triggers.read", write: "triggers.manage" },
  },
}, [[{ tenantId: 1, gatilhoId: 1, baseOmieId: 1 }, { unique: true }]]);
