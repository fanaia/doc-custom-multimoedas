"use strict";
const { businessStatus, defineTenantModel, fields } = require("./_shared");
const { FIELDS, validateField } = require("../services/europartnerSettings");

const schema = {
  baseOmieId: { ...fields.ref("BaseOmie", { label: "Base (vazio para padrão do cliente)" }), default: null },
  contractVersion: { type: Number, enum: [1], default: 1, required: true },
  status: businessStatus(),
};
for (const [field, [, type]] of Object.entries(FIELDS)) {
  const definition = type === "booleano" ? { type: Boolean } : type === "lista-emails" ? { type: [String], default: undefined } : { type: String, maxlength: 300 };
  schema[field] = { ...definition, __meta: { kind: type === "booleano" ? "boolean" : type === "lista-emails" ? "array" : "string", label: field }, validate: { validator(value) { try { validateField(field, value); return true; } catch { return false; } }, message: `EUROPARTNER_SETTINGS_INVALID:${field}` } };
}
defineTenantModel({ name: "EuropartnerSettings", singular: "características Europartner", basePath: "/europartner-settings", schema,
  crud: { enabled: true, permissions: { read: "settings.read", write: "settings.manage" } },
}, [[{ tenantId: 1, baseOmieId: 1 }, { unique: true }]]);
