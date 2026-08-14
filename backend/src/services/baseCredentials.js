"use strict";

const { GenericError, registry, scopedIdFilter } = require("@oondemand/oon-core-back");
const { decrypt, encrypt, generateToken, hash, mask } = require("./security");

function Base() {
  return registry.getModel("BaseOmie").mongooseModel;
}

async function findScopedBase(id, accessContext, options = {}) {
  let query = Base().findOne(scopedIdFilter(registry.getModel("BaseOmie"), id, accessContext));
  if (options.secrets) query = query.select("+tenantId +appKeyEncrypted +appSecretEncrypted +webhookTokenEncrypted +webhookTokenHash");
  const base = await query;
  if (!base) throw new GenericError("Base Omie nao encontrada neste tenant.", {
    statusCode: 404,
    code: "BASE_OMIE_NOT_FOUND",
  });
  return base;
}

async function configureCredentials(id, accessContext, input = {}) {
  const base = await findScopedBase(id, accessContext, { secrets: true });
  const appKey = String(input.appKey || "").trim();
  const appSecret = String(input.appSecret || "").trim();
  if (!appKey || !appSecret) throw new GenericError("Informe App Key e App Secret.", { statusCode: 422 });
  const update = {
    appKeyEncrypted: encrypt(appKey),
    appSecretEncrypted: encrypt(appSecret),
    appKeyMasked: mask(appKey),
    credenciaisConfiguradas: true,
    statusConexao: "nao-testada",
    ultimoErroConexao: "",
  };
  if (!base.webhookTokenEncrypted) {
    const token = generateToken();
    update.webhookTokenEncrypted = encrypt(token);
    update.webhookTokenHash = hash(token);
    update.webhookConfigurado = true;
  }
  await Base().updateOne({ _id: base._id, tenantId: accessContext.tenantId }, { $set: update });
  return Base().findOne({ _id: base._id, tenantId: accessContext.tenantId });
}

async function credentialsFor(baseOrId, accessContext) {
  const base = typeof baseOrId === "object" && baseOrId.appKeyEncrypted
    ? baseOrId
    : await findScopedBase(baseOrId?._id || baseOrId, accessContext, { secrets: true });
  if (!base.credenciaisConfiguradas || !base.appKeyEncrypted || !base.appSecretEncrypted) {
    throw new GenericError("Credenciais Omie nao configuradas para a base.", {
      statusCode: 422,
      code: "OMIE_CREDENTIALS_REQUIRED",
    });
  }
  return { base, appKey: decrypt(base.appKeyEncrypted), appSecret: decrypt(base.appSecretEncrypted) };
}

async function rotateWebhook(id, accessContext) {
  const base = await findScopedBase(id, accessContext, { secrets: true });
  const token = generateToken();
  await Base().updateOne({ _id: base._id, tenantId: accessContext.tenantId }, {
    $set: { webhookTokenEncrypted: encrypt(token), webhookTokenHash: hash(token), webhookConfigurado: true },
  });
  return webhookAccess(base, token, true);
}

function webhookAccess(base, token, rotated = false) {
  const publicUrl = String(process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const path = `/api/doc-custom/webhooks/omie/${encodeURIComponent(token)}`;
  return { baseId: String(base._id), webhookUrl: publicUrl ? `${publicUrl}${path}` : path, rotated };
}

async function getWebhookAccess(id, accessContext) {
  const base = await findScopedBase(id, accessContext, { secrets: true });
  if (!base.webhookTokenEncrypted) return rotateWebhook(id, accessContext);
  return webhookAccess(base, decrypt(base.webhookTokenEncrypted), false);
}

async function resolveBaseByWebhookToken(token) {
  const tokenHash = hash(token);
  const base = await Base().findOne({ webhookTokenHash: tokenHash, status: "ativo" })
    .select("+tenantId +appKeyEncrypted +appSecretEncrypted +webhookTokenEncrypted +webhookTokenHash");
  if (!base) return null;
  return base;
}

module.exports = {
  configureCredentials,
  credentialsFor,
  findScopedBase,
  getWebhookAccess,
  resolveBaseByWebhookToken,
  rotateWebhook,
};
