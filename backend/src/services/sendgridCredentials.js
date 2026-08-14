"use strict";

const { GenericError, registry } = require("@oondemand/oon-core-back");
const { decrypt, encrypt, mask } = require("./security");

function Config() { return registry.getModel("SendGridConfig").mongooseModel; }

async function getPublic(tenantId) {
  return Config().findOne({ tenantId }).select("apiKeyMasked credencialConfigurada remetenteEmail remetenteNome status statusConexao ultimaConexaoEm ultimoErroConexao").lean();
}

async function configure(tenantId, input = {}) {
  const current = await Config().findOne({ tenantId }).select("+apiKeyEncrypted");
  const apiKey = String(input.apiKey || "").trim();
  if (!current && !apiKey) throw new GenericError("Informe a API Key do SendGrid.", { statusCode: 422 });
  const email = String(input.remetenteEmail || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new GenericError("Informe um e-mail remetente válido.", { statusCode: 422 });
  const update = { remetenteEmail: email, remetenteNome: String(input.remetenteNome || "").trim(), status: input.status === "inativo" ? "inativo" : "ativo", statusConexao: "nao-testada", ultimoErroConexao: "" };
  if (apiKey) Object.assign(update, { apiKeyEncrypted: encrypt(apiKey), apiKeyMasked: mask(apiKey), credencialConfigurada: true });
  await Config().findOneAndUpdate({ tenantId, codigo: "sendgrid" }, { $set: update, $setOnInsert: { tenantId, codigo: "sendgrid" } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  return getPublic(tenantId);
}

async function credentials(tenantId) {
  const config = await Config().findOne({ tenantId, status: "ativo", credencialConfigurada: true }).select("+apiKeyEncrypted");
  if (!config?.apiKeyEncrypted) throw new GenericError("Configure a integração SendGrid para este tenant.", { statusCode: 422, code: "SENDGRID_CREDENTIAL_REQUIRED" });
  return { apiKey: decrypt(config.apiKeyEncrypted), from: { email: config.remetenteEmail, name: config.remetenteNome } };
}

module.exports = { configure, credentials, getPublic };
