"use strict";

const { businessStatus, defineTenantModel, fields, secretField } = require("./_shared");

defineTenantModel({
  name: "SendGridConfig",
  singular: "configuracao-sendgrid",
  basePath: "/configuracoes-sendgrid",
  schema: {
    codigo: fields.string({ required: true, label: "Código", default: "sendgrid" }),
    apiKeyEncrypted: secretField(),
    apiKeyMasked: fields.string({ label: "API Key" }),
    credencialConfigurada: fields.boolean({ label: "Credencial configurada", default: false }),
    remetenteEmail: fields.string({ required: true, label: "E-mail remetente" }),
    remetenteNome: fields.string({ label: "Nome do remetente" }),
    status: businessStatus(),
    statusConexao: fields.enum(["nao-testada", "ok", "erro"], { label: "Conexão", default: "nao-testada" }),
    ultimaConexaoEm: fields.date({ label: "Último teste" }),
    ultimoErroConexao: fields.string({ label: "Último erro" }),
  },
  crud: {
    enabled: true,
    permissions: { read: "settings.read", write: "settings.manage" },
  },
}, [[{ tenantId: 1, codigo: 1 }, { unique: true }]]);
