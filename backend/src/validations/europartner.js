"use strict";
const { defineValidation, GenericError, registry } = require("@oondemand/oon-core-back");
const { validateSettings } = require("../services/europartnerSettings");
defineValidation("EuropartnerSettings", async (data, context) => {
  validateSettings(context.requestedChanges || context.changes || {});
  validateSettings(data);
  if (data.baseOmieId && !await registry.getModel("BaseOmie").mongooseModel.exists({ _id: data.baseOmieId, tenantId: context.accessContext?.tenantId })) {
    throw new GenericError("Base não pertence ao cliente atual.", { statusCode: 403, code: "TENANT_REFERENCE_DENIED" });
  }
});
