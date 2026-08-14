"use strict";

const { defineModel, fields } = require("@oondemand/oon-core-back");

function secretField() {
  return { type: String, default: "", select: false, trim: false };
}

function tenantIdField() {
  return { type: String, required: true, index: true, select: false, trim: true };
}

function defineTenantModel(definition, indexes = []) {
  const entry = defineModel({
    ...definition,
    scope: "tenant",
    tenancy: { scope: "tenant", tenantField: "tenantId" },
    schema: {
      tenantId: tenantIdField(),
      ...definition.schema,
    },
  });

  for (const [keys, options] of indexes) {
    entry.mongooseModel.schema.index(keys, options);
  }
  return entry;
}

function businessStatus(defaultValue = "ativo") {
  return fields.enum(["ativo", "inativo"], {
    label: "Status",
    default: defaultValue,
  });
}

module.exports = {
  businessStatus,
  defineTenantModel,
  fields,
  secretField,
};
