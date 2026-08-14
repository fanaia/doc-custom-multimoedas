"use strict";

const { businessStatus, defineTenantModel, fields, secretField } = require("./_shared");

defineTenantModel({
  name: "BaseOmie",
  singular: "base-omie",
  basePath: "/bases-omie",
  schema: {
    codigo: fields.string({ required: true, label: "Codigo", searchable: true }),
    nome: fields.string({ required: true, label: "Nome", searchable: true }),
    cnpj: fields.string({ required: true, label: "CNPJ", searchable: true }),
    ambiente: fields.enum(["producao", "homologacao"], { label: "Ambiente", default: "producao" }),
    status: businessStatus("inativo"),
    appKeyMasked: fields.string({ label: "App Key" }),
    credenciaisConfiguradas: fields.boolean({ label: "Credenciais configuradas", default: false }),
    webhookConfigurado: fields.boolean({ label: "Webhook configurado", default: false }),
    statusConexao: fields.enum(["nao-testada", "ok", "erro"], {
      label: "Conexao",
      default: "nao-testada",
    }),
    ultimaConexaoEm: fields.date({ label: "Ultimo teste" }),
    ultimoErroConexao: fields.string({ label: "Ultimo erro" }),
    appKeyEncrypted: secretField(),
    appSecretEncrypted: secretField(),
    webhookTokenEncrypted: secretField(),
    webhookTokenHash: { type: String, select: false, trim: false },
  },
  crud: {
    enabled: true,
    permissions: { read: "bases.read", write: "bases.manage" },
  },
}, [
  [{ tenantId: 1, codigo: 1 }, { unique: true }],
  [{ tenantId: 1, cnpj: 1 }, { unique: true }],
  [{ webhookTokenHash: 1 }, { unique: true, sparse: true }],
]);
