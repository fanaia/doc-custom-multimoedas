"use strict";

const { GenericError, defineTrigger, defineValidation, registry } = require("@oondemand/oon-core-back");

function invalid(message, code = "DOMAIN_VALIDATION_ERROR") {
  throw new GenericError(message, { statusCode: 422, code });
}

function changed(context, fields) {
  const requested = context?.requestedChanges || context?.changes || {};
  return fields.some((field) => Object.prototype.hasOwnProperty.call(requested, field));
}

async function assertTenantRef(modelName, id, tenantId, label) {
  if (!id) invalid(`${label} e obrigatorio.`);
  const Model = registry.getModel(modelName).mongooseModel;
  const exists = await Model.exists({ _id: id, tenantId });
  if (!exists) invalid(`${label} nao pertence ao tenant atual.`, "TENANT_REFERENCE_DENIED");
}

defineValidation("BaseOmie", async (data, context) => {
  if (changed(context, ["appKeyEncrypted", "appKeyHash", "appSecretEncrypted", "webhookTokenEncrypted", "webhookTokenHash", "appKeyMasked", "credenciaisConfiguradas", "webhookConfigurado", "statusConexao", "ultimaConexaoEm", "ultimoErroConexao"])) {
    invalid("Credenciais e campos tecnicos devem ser alterados pelas acoes seguras da Base Omie.", "CONTROLLED_FIELD");
  }
  const cnpj = String(data.cnpj || "").replace(/\D/g, "");
  if (cnpj.length !== 14) invalid("CNPJ da Base Omie deve conter 14 digitos.");
  if (data.status === "ativo" && !data.credenciaisConfiguradas) invalid("Configure as credenciais antes de ativar a Base Omie.");
});

defineValidation("Configuracao", async (data, context) => {
  if (data.baseOmieId) await assertTenantRef("BaseOmie", data.baseOmieId, context.accessContext?.tenantId, "Base Omie");
  if (data.tipo === "numero" && !Number.isFinite(Number(data.valor))) invalid("Valor da configuracao deve ser numerico.");
  if (data.tipo === "booleano" && !["true", "false"].includes(String(data.valor).toLowerCase())) invalid("Booleano deve ser true ou false.");
});

defineValidation("SendGridConfig", async (data, context) => {
  if (changed(context, ["apiKeyEncrypted", "apiKeyMasked", "credencialConfigurada", "statusConexao", "ultimaConexaoEm", "ultimoErroConexao"])) {
    invalid("Credenciais SendGrid devem ser alteradas pela configuração segura da integração.", "CONTROLLED_FIELD");
  }
});

defineValidation("Moeda", async (data, context) => {
  if (changed(context, ["ultimoValorValido", "ultimaReferenciaEm", "ultimaConsultaEm", "ultimaOrigem"])) {
    invalid("Historico da moeda e controlado pela execucao.", "CONTROLLED_FIELD");
  }
  if (!/^[A-Z]{3}$/.test(String(data.codigo || "").toUpperCase())) invalid("Codigo ISO da moeda deve ter tres letras.");
  if (data.fonte === "fixa" && !(Number(data.valorFixo) > 0)) invalid("Moeda fixa exige valor maior que zero.");
  if (data.fonte === "bacen" && data.status === "ativo" && !(Number(data.ultimoValorValido) > 0) && !(Number(data.valorContingencia) > 0)) {
    invalid("Moeda Bacen sem historico exige valor de contingencia antes da ativacao.", "CURRENCY_CONTINGENCY_REQUIRED");
  }
});

defineValidation("Template", async (data, context) => {
  if (Number(data.versao) < 1 || !Number.isInteger(Number(data.versao))) invalid("Versao do template deve ser um inteiro positivo.");
  if (Buffer.byteLength(String(data.conteudo || ""), "utf8") > 2 * 1024 * 1024) invalid("Template excede 2 MB.");
  if (context.op === "update" && changed(context, ["codigo", "tipo", "versao", "conteudo"])) {
    invalid("Conteudo e versao de template sao imutaveis; crie uma nova versao.", "TEMPLATE_VERSION_IMMUTABLE");
  }
});

defineValidation("Imagem", async (data) => {
  const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  if (!allowed.has(data.contentType)) invalid("Tipo de imagem nao permitido.");
  const raw = String(data.conteudo || "").replace(/^data:[^;]+;base64,/, "");
  if (!/^[a-z0-9+/]*={0,2}$/i.test(raw) || raw.length % 4 !== 0) invalid("Conteudo Base64 invalido.");
  const actual = Buffer.byteLength(raw, "base64");
  const limit = Number(process.env.IMAGE_MAX_BYTES || 2 * 1024 * 1024);
  if (actual < 1 || actual > limit) invalid(`Imagem deve ter entre 1 e ${limit} bytes.`);
  if (Number(data.tamanho) !== actual) invalid(`Tamanho informado (${data.tamanho}) difere do Base64 (${actual}).`);
});

defineValidation("Gatilho", async (data, context) => {
  if (data.tipoDocumento !== "ordem-servico") invalid("A Central aceita somente Ordem de Servico.");
  const tenantId = context.accessContext?.tenantId;
  const Template = registry.getModel("Template").mongooseModel;
  const expected = [
    [data.templateDocumentoId, "documento"],
    [data.templateAssuntoId, "assunto"],
    [data.templateCorpoId, "corpo-email"],
  ];
  for (const [id, type] of expected) {
    const exists = await Template.exists({ _id: id, tenantId, tipo: type, status: "ativo" });
    if (!exists) invalid(`Template ${type} ativo nao pertence ao tenant atual.`, "TENANT_REFERENCE_DENIED");
  }
});

defineValidation("GatilhoBase", async (data, context) => {
  const tenantId = context.accessContext?.tenantId;
  await assertTenantRef("Gatilho", data.gatilhoId, tenantId, "Gatilho");
  await assertTenantRef("BaseOmie", data.baseOmieId, tenantId, "Base Omie");
  const stages = [data.etapaEnvio, data.etapaErro, data.etapaSucesso].map(String);
  if (new Set(stages).size !== 3) invalid("Etapas de envio, erro e sucesso devem ser diferentes.");
  const count = await registry.getModel("EtapaOmie").mongooseModel.countDocuments({
    tenantId,
    baseOmieId: data.baseOmieId,
    codigo: { $in: stages },
    status: "ativo",
  });
  if (count !== 3) invalid("Sincronize a Base Omie e selecione tres etapas validas de Venda de Servico.", "OMIE_STAGE_INVALID");
});

for (const modelName of ["CotacaoMoeda", "EtapaOmie", "ProcessoFatura", "ArtefatoPdf", "EventoProcesso", "IntegracaoTicket"]) {
  defineValidation(modelName, async () => invalid("Registro controlado pela esteira; use as acoes do processo.", "SYSTEM_MANAGED_RECORD"));
}

for (const modelName of ["BaseOmie", "Configuracao", "Template", "Imagem", "Gatilho"]) {
  defineTrigger(modelName, {
    before(doc) {
      if (typeof doc.codigo === "string") doc.codigo = doc.codigo.trim().toLowerCase();
    },
  });
}

defineTrigger("Moeda", {
  before(doc) {
    if (typeof doc.codigo === "string") doc.codigo = doc.codigo.trim().toUpperCase();
    if (typeof doc.simbolo === "string") doc.simbolo = doc.simbolo.trim().toUpperCase();
  },
});
