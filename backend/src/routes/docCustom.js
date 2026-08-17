"use strict";

const {
  GenericError,
  defineRoutes,
  registry,
} = require("@oondemand/oon-core-back");
const { configureCredentials, findScopedBase, getWebhookAccess, rotateWebhook } = require("../services/baseCredentials");
const { getConfiguration, resolvedConfigurations } = require("../services/configuration");
const { sendEmail } = require("../services/emailSender");
const gateway = require("../services/integrations/omieGateway");
const workflow = require("../services/invoiceWorkflow");
const { importMandatoryTemplate } = require("../services/mandatoryTemplate");
const { normalizeRecipients, withInternalCopies } = require("../services/recipients");
const { errorSummary } = require("../services/sanitization");
const { receiveWebhook } = require("../services/webhookService");
const sendgrid = require("../services/sendgridCredentials");
const integrationTickets = require("../services/integrationTickets");

function Model(name) {
  return registry.getModel(name).mongooseModel;
}

function actor(req) {
  return { userId: req.accessContext?.userId || req.usuario?.email || "system" };
}

function processAudit(action) {
  return { entidade: "ProcessoFatura", acao: action };
}

const DEFAULT_CURRENCIES = [
  { codigo: "USD", simbolo: "$", valorContingencia: 5.03 },
  { codigo: "EUR", simbolo: "€", valorContingencia: 5.9 },
  { codigo: "JPY", simbolo: "¥", valorContingencia: 0.035 },
];

async function ensureDefaultCurrencies(tenantId) {
  const Currency = Model("Moeda");
  await Currency.bulkWrite(DEFAULT_CURRENCIES.map((currency) => ({
    updateOne: {
      filter: { tenantId, codigo: currency.codigo },
      update: { $setOnInsert: { tenantId, ...currency, fonte: "bacen", status: "ativo", ultimaOrigem: "nenhuma" } },
      upsert: true,
    },
  })));
}

async function synchronizeCatalog({ modelName, base, accessContext, items, mapItem }) {
  const Catalog = Model(modelName);
  const now = new Date();
  const keys = [];
  for (const raw of items) {
    const item = mapItem(raw);
    keys.push(item.codigo);
    await Catalog.findOneAndUpdate(
      { tenantId: accessContext.tenantId, baseOmieId: base._id, codigo: item.codigo },
      { $set: { ...item, sincronizadaEm: now, status: item.status || "ativo" }, $setOnInsert: { tenantId: accessContext.tenantId, baseOmieId: base._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  await Catalog.updateMany({ tenantId: accessContext.tenantId, baseOmieId: base._id, codigo: { $nin: keys } }, { $set: { status: "inativo" } });
  return { total: items.length, synchronizedAt: now };
}

async function handleOmieWebhook(req, res) {
  const result = await receiveWebhook(req.params.token, req.body || {});
  res.status(200).json(result);
}

async function handleProcessPdf(req, res) {
  const invoiceProcess = await workflow.loadProcess(req.params.id, req.accessContext);
  const artifact = await Model("ArtefatoPdf").findOne({
    _id: invoiceProcess.artefatoPdfId,
    tenantId: req.accessContext.tenantId,
  }).select("+conteudoBase64");
  if (!artifact) throw new GenericError("PDF nao encontrado.", { statusCode: 404 });
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `inline; filename="${String(artifact.nomeArquivo || "fatura.pdf").replace(/[\"\r\n]/g, "-")}"`);
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("etag", `"${artifact.hash}"`);
  res.send(Buffer.from(artifact.conteudoBase64, "base64"));
}

// O ingress público remove o primeiro segmento /api antes de encaminhar ao backend.
// Este alias mantém a URL pública /api/doc-custom/... funcional sem remover a rota
// canônica, usada no desenvolvimento local e em integrações internas.
defineRoutes("/doc-custom", (router) => {
  router.public.post("/webhooks/omie/:token", handleOmieWebhook);
  router.private.get("/processos/:id/pdf", { permission: "process.read" }, handleProcessPdf);
});

defineRoutes("/api/doc-custom", (router) => {
  router.public.post("/webhooks/omie/:token", handleOmieWebhook);

  router.private.get("/operacao/catalogos", { permission: "dashboard.read" }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    await ensureDefaultCurrencies(tenantId);
    const [bases, imagens, templates, documentos, configuracoes, etapas, categorias, contasCorrentes, gatilhos, mapeamentos, sendgridConfig] = await Promise.all([
      Model("BaseOmie").find({ tenantId }).sort({ nome: 1 }).lean(),
      Model("Imagem").find({ tenantId }).sort({ updatedAt: -1 }).lean(),
      Model("Template").find({ tenantId }).select("codigo descricao tipo versao contratoVariaveis status updatedAt").sort({ updatedAt: -1 }).lean(),
      Model("ArtefatoPdf").find({ tenantId }).sort({ geradoEm: -1 }).limit(100).lean(),
      Model("Configuracao").find({ tenantId }).populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("EtapaOmie").find({ tenantId }).select("baseOmieId codigo descricao status sincronizadaEm").populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("CategoriaOmie").find({ tenantId }).select("baseOmieId codigo descricao status sincronizadaEm").populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("ContaCorrenteOmie").find({ tenantId }).select("baseOmieId codigo descricao banco status sincronizadaEm").populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("Gatilho").find({ tenantId }).populate("templateDocumentoId templateAssuntoId templateCorpoId", "codigo descricao tipo versao contratoVariaveis").sort({ descricao: 1 }).lean(),
      Model("GatilhoBase").find({ tenantId }).populate("baseOmieId", "nome codigo").sort({ createdAt: 1 }).lean(),
      sendgrid.getPublic(tenantId),
    ]);
    res.json({ bases, imagens, templates, documentos, configuracoes, etapas, categorias, contasCorrentes, gatilhos, mapeamentos, sendgridConfig });
  });

  router.private.get("/integracoes/tickets", { permission: "audit.read" }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const filter = { tenantId };
    const safeRegex = (value) => String(value || "").slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (req.query.baseOmieId) filter.baseOmieId = (await findScopedBase(req.query.baseOmieId, req.accessContext))._id;
    const tickets = await Model("IntegracaoTicket").find(filter).populate("baseOmieId", "nome codigo").sort({ iniciadoEm: -1 }).limit(250).lean();
    res.json({ tickets });
  });

  router.private.put("/integracoes/sendgrid", { permission: "settings.manage", audit: { entidade: "SendGridConfig", acao: "configurada" } }, async (req, res) => {
    res.json({ message: "Integração SendGrid salva com sucesso.", config: await sendgrid.configure(req.accessContext.tenantId, req.body || {}) });
  });

  router.private.post("/integracoes/sendgrid/testar", { permission: "settings.manage", audit: { entidade: "SendGridConfig", acao: "conexao-testada" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const credential = await sendgrid.credentials(tenantId);
    const ticket = await integrationTickets.start({ tenantId, provider: "sendgrid", operacao: "scopes.read", requisicao: {} });
    try {
      const response = await fetch("https://api.sendgrid.com/v3/scopes", { headers: { authorization: `Bearer ${credential.apiKey}` }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new GenericError(`SendGrid recusou a credencial (HTTP ${response.status}).`, { statusCode: 422, code: "SENDGRID_AUTH_ERROR" });
      await integrationTickets.success(ticket, { resposta: { httpStatus: response.status } });
      await Model("SendGridConfig").updateOne({ tenantId }, { $set: { statusConexao: "ok", ultimaConexaoEm: new Date(), ultimoErroConexao: "" } });
      res.json({ message: "Conexão SendGrid validada com sucesso." });
    } catch (error) {
      await integrationTickets.failure(ticket, error);
      await Model("SendGridConfig").updateOne({ tenantId }, { $set: { statusConexao: "erro", ultimaConexaoEm: new Date(), ultimoErroConexao: String(error.message || "Falha de autenticação.").slice(0, 500) } });
      throw error;
    }
  });

  router.private.post("/integracoes/sendgrid/enviar-teste", { permission: "settings.manage", audit: { entidade: "SendGridConfig", acao: "email-teste-enviado" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const recipients = normalizeRecipients({ to: req.body?.destinatario });
    if (recipients.invalid.length || recipients.to.length !== 1) {
      throw new GenericError("Informe um único e-mail destinatário válido.", {
        statusCode: 422,
        code: "EMAIL_RECIPIENT_INVALID",
      });
    }
    const credential = await sendgrid.credentials(tenantId);
    const accepted = await sendEmail({
      from: credential.from,
      to: recipients.to,
      subject: "Teste de integração SendGrid — Doc Custom Multimoedas",
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033"><h2 style="color:#0077b6">Integração SendGrid validada</h2><p>Este e-mail confirma que a Central Doc Custom Multimoedas consegue enviar mensagens usando a configuração deste tenant.</p><p><strong>Enviado em:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></div>`,
      attachments: [],
    }, { apiKey: credential.apiKey, tenantId });
    res.json({
      message: `E-mail de teste enviado para ${recipients.to[0]}.`,
      providerId: accepted.id,
      acceptedAt: accepted.acceptedAt,
    });
  });

  async function validateMappingInput(input, tenantId, triggerId) {
    const base = await Model("BaseOmie").findOne({ _id: input.baseOmieId, tenantId, status: "ativo" });
    if (!base) throw new GenericError("Base Omie ativa nao encontrada.", { statusCode: 422, code: "TENANT_REFERENCE_DENIED" });
    const trigger = await Model("Gatilho").exists({ _id: triggerId, tenantId });
    if (!trigger) throw new GenericError("Gatilho nao encontrado.", { statusCode: 404 });
    const stages = [input.etapaEnvio, input.etapaErro, input.etapaSucesso].map((value) => String(value || ""));
    if (new Set(stages).size !== 3 || stages.some((value) => !value)) {
      throw new GenericError("Selecione etapas diferentes para envio, erro e sucesso.", { statusCode: 422 });
    }
    const count = await Model("EtapaOmie").countDocuments({ tenantId, baseOmieId: base._id, codigo: { $in: stages }, status: "ativo" });
    if (count !== 3) throw new GenericError("Selecione somente etapas ativas sincronizadas para esta Base Omie.", { statusCode: 422, code: "OMIE_STAGE_INVALID" });
    return { baseOmieId: base._id, etapaEnvio: stages[0], etapaErro: stages[1], etapaSucesso: stages[2], status: input.status === "inativo" ? "inativo" : "ativo" };
  }

  async function validateTriggerInput(input, tenantId) {
    const expected = [[input.templateDocumentoId, "documento"], [input.templateAssuntoId, "assunto"], [input.templateCorpoId, "corpo-email"]];
    for (const [id, tipo] of expected) {
      const template = await Model("Template").exists({ _id: id, tenantId, tipo, status: "ativo" });
      if (!template) throw new GenericError(`Selecione um template ativo do tipo ${tipo}.`, { statusCode: 422, code: "TENANT_REFERENCE_DENIED" });
    }
    return { codigo: String(input.codigo || "").trim().toLowerCase(), descricao: String(input.descricao || "").trim(), tipoDocumento: "ordem-servico", templateDocumentoId: input.templateDocumentoId, templateAssuntoId: input.templateAssuntoId, templateCorpoId: input.templateCorpoId, status: input.status === "inativo" ? "inativo" : "ativo" };
  }

  router.private.post("/gatilhos", { permission: "triggers.manage", audit: { entidade: "Gatilho", acao: "criado" } }, async (req, res) => {
    const values = await validateTriggerInput(req.body || {}, req.accessContext.tenantId);
    const trigger = await Model("Gatilho").create({ tenantId: req.accessContext.tenantId, ...values });
    res.status(201).json({ message: "Gatilho criado com sucesso.", trigger });
  });

  router.private.put("/gatilhos/:id", { permission: "triggers.manage", audit: { entidade: "Gatilho", acao: "atualizado" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const values = await validateTriggerInput(req.body || {}, tenantId);
    const trigger = await Model("Gatilho").findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: values }, { new: true, runValidators: true });
    if (!trigger) throw new GenericError("Gatilho nao encontrado.", { statusCode: 404 });
    res.json({ message: "Gatilho atualizado com sucesso.", trigger });
  });

  router.private.delete("/gatilhos/:id", { permission: "triggers.manage", audit: { entidade: "Gatilho", acao: "excluido" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const inUse = await Model("ProcessoFatura").exists({ tenantId, gatilhoId: req.params.id });
    if (inUse) throw new GenericError("O gatilho possui processos e nao pode ser excluido; altere o status para inativo.", { statusCode: 409 });
    const trigger = await Model("Gatilho").findOneAndDelete({ _id: req.params.id, tenantId });
    if (!trigger) throw new GenericError("Gatilho nao encontrado.", { statusCode: 404 });
    await Model("GatilhoBase").deleteMany({ tenantId, gatilhoId: req.params.id });
    res.json({ message: "Gatilho excluido com sucesso." });
  });

  router.private.post("/gatilhos/:id/bases", { permission: "triggers.manage", audit: { entidade: "GatilhoBase", acao: "criado" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const values = await validateMappingInput(req.body || {}, tenantId, req.params.id);
    const existing = await Model("GatilhoBase").exists({ tenantId, gatilhoId: req.params.id, baseOmieId: values.baseOmieId });
    if (existing) throw new GenericError("Esta base ja possui etapas cadastradas neste gatilho.", { statusCode: 409 });
    const mapping = await Model("GatilhoBase").create({ tenantId, gatilhoId: req.params.id, ...values });
    res.status(201).json({ message: "Etapas da base cadastradas com sucesso.", mapping });
  });

  router.private.put("/gatilhos/:id/bases/:mappingId", { permission: "triggers.manage", audit: { entidade: "GatilhoBase", acao: "atualizado" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const values = await validateMappingInput(req.body || {}, tenantId, req.params.id);
    const duplicate = await Model("GatilhoBase").exists({ tenantId, gatilhoId: req.params.id, baseOmieId: values.baseOmieId, _id: { $ne: req.params.mappingId } });
    if (duplicate) throw new GenericError("Esta base ja possui etapas cadastradas neste gatilho.", { statusCode: 409 });
    const mapping = await Model("GatilhoBase").findOneAndUpdate({ _id: req.params.mappingId, tenantId, gatilhoId: req.params.id }, { $set: values }, { new: true, runValidators: true });
    if (!mapping) throw new GenericError("Cadastro de etapas nao encontrado.", { statusCode: 404 });
    res.json({ message: "Etapas da base atualizadas com sucesso.", mapping });
  });

  router.private.delete("/gatilhos/:id/bases/:mappingId", { permission: "triggers.manage", audit: { entidade: "GatilhoBase", acao: "excluido" } }, async (req, res) => {
    const mapping = await Model("GatilhoBase").findOneAndDelete({ _id: req.params.mappingId, tenantId: req.accessContext.tenantId, gatilhoId: req.params.id });
    if (!mapping) throw new GenericError("Cadastro de etapas nao encontrado.", { statusCode: 404 });
    res.json({ message: "Cadastro de etapas excluido com sucesso." });
  });
  router.private.post("/bases", { permission: "bases.manage", audit: { entidade: "BaseOmie", acao: "base-configurada" } }, async (req, res) => {
    const input = req.body || {};
    const base = await Model("BaseOmie").create({
      tenantId: req.accessContext.tenantId,
      codigo: String(input.codigo || "").trim(),
      nome: String(input.nome || "").trim(),
      cnpj: String(input.cnpj || "").replace(/\D/g, ""),
      ambiente: input.ambiente === "homologacao" ? "homologacao" : "producao",
      status: input.status === "inativo" ? "inativo" : "ativo",
    });
    try {
      const configured = await configureCredentials(base._id, req.accessContext, input);
      res.status(201).json({ base: configured });
    } catch (error) {
      await Model("BaseOmie").deleteOne({ _id: base._id, tenantId: req.accessContext.tenantId });
      throw error;
    }
  });

  router.private.put("/bases/:id/credenciais", { permission: "bases.manage", audit: { entidade: "BaseOmie", acao: "credenciais-alteradas" } }, async (req, res) => {
    const base = await configureCredentials(req.params.id, req.accessContext, req.body || {});
    res.json({ base });
  });
  router.private.post("/bases/:id/testar", { permission: "bases.manage", audit: { entidade: "BaseOmie", acao: "conexao-testada" } }, async (req, res) => {
    const base = await findScopedBase(req.params.id, req.accessContext, { secrets: true });
    try {
      await gateway.testConnection(base, req.accessContext, { allowInactive: true });
      await Model("BaseOmie").updateOne({ _id: base._id, tenantId: req.accessContext.tenantId }, {
        $set: { statusConexao: "ok", ultimaConexaoEm: new Date(), ultimoErroConexao: "" },
      });
      res.json({ ok: true });
    } catch (error) {
      const summary = errorSummary(error);
      await Model("BaseOmie").updateOne({ _id: base._id, tenantId: req.accessContext.tenantId }, {
        $set: { statusConexao: "erro", ultimaConexaoEm: new Date(), ultimoErroConexao: summary.message },
      });
      throw error;
    }
  });
  router.private.post("/bases/:id/etapas/sincronizar", { permission: "bases.manage", audit: { entidade: "EtapaOmie", acao: "sincronizadas" } }, async (req, res) => {
    const base = await findScopedBase(req.params.id, req.accessContext, { secrets: true });
    const stages = await gateway.listarEtapas(base, req.accessContext);
    const Stage = Model("EtapaOmie");
    const now = new Date();
    const codes = [];
    for (const stage of stages) {
      codes.push(stage.codigo);
      await Stage.findOneAndUpdate(
        { tenantId: req.accessContext.tenantId, baseOmieId: base._id, codigo: stage.codigo },
        { $set: { descricao: stage.descricao, sincronizadaEm: now, status: "ativo" }, $setOnInsert: { tenantId: req.accessContext.tenantId, baseOmieId: base._id, codigo: stage.codigo } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
    await Stage.updateMany({ tenantId: req.accessContext.tenantId, baseOmieId: base._id, codigo: { $nin: codes } }, { $set: { status: "inativo" } });
    res.json({ results: stages, total: stages.length, synchronizedAt: now });
  });
  router.private.post("/bases/:id/categorias/sincronizar", { permission: "bases.manage", audit: { entidade: "CategoriaOmie", acao: "sincronizadas" } }, async (req, res) => {
    const base = await findScopedBase(req.params.id, req.accessContext, { secrets: true });
    const items = await gateway.listarCategorias(base, req.accessContext);
    res.json(await synchronizeCatalog({ modelName: "CategoriaOmie", base, accessContext: req.accessContext, items, mapItem: (item) => item }));
  });
  router.private.post("/bases/:id/contas-correntes/sincronizar", { permission: "bases.manage", audit: { entidade: "ContaCorrenteOmie", acao: "sincronizadas" } }, async (req, res) => {
    const base = await findScopedBase(req.params.id, req.accessContext, { secrets: true });
    const items = await gateway.listarContasCorrentes(base, req.accessContext);
    res.json(await synchronizeCatalog({ modelName: "ContaCorrenteOmie", base, accessContext: req.accessContext, items, mapItem: (item) => ({ ...item, status: item.inativo ? "inativo" : "ativo", inativo: undefined }) }));
  });
  router.private.get("/bases/:id/webhook", { permission: "bases.read" }, async (req, res) => {
    res.json(await getWebhookAccess(req.params.id, req.accessContext));
  });
  router.private.post("/bases/:id/webhook/rotacionar", { permission: "bases.manage", audit: { entidade: "BaseOmie", acao: "webhook-rotacionado" } }, async (req, res) => {
    res.json(await rotateWebhook(req.params.id, req.accessContext));
  });

  router.private.get("/processos-operacao", { permission: "process.read" }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const filter = { tenantId };
    const safeRegex = (value) => String(value || "").slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (req.query.baseOmieId) filter.baseOmieId = req.query.baseOmieId;
    if (req.query.etapa) filter.etapa = req.query.etapa;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.os) filter.$or = [
      { numeroOs: { $regex: safeRegex(req.query.os), $options: "i" } },
      { codigoOs: { $regex: safeRegex(req.query.os), $options: "i" } },
    ];
    if (req.query.cliente) filter.clienteNome = { $regex: safeRegex(req.query.cliente), $options: "i" };
    if (req.query.ativos === "true") filter.status = { $nin: ["arquivado"] };
    const processos = await Model("ProcessoFatura").find(filter)
      .populate("baseOmieId", "nome codigo ambiente")
      .sort({ iniciadoEm: -1 })
      .limit(300)
      .lean();
    res.json({ processos, total: processos.length });
  });

  router.private.post("/processos/:id/aprovar-processamento", { permission: "process.approve", audit: processAudit("processamento-aprovado") }, async (req, res) => {
    res.json({ processo: await workflow.approveProcessing(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.post("/processos/:id/aprovar-fatura", { permission: "process.approve", audit: processAudit("fatura-aprovada") }, async (req, res) => {
    res.json({ processo: await workflow.approveInvoice(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.post("/processos/:id/rejeitar", { permission: "process.approve", audit: processAudit("rejeitado") }, async (req, res) => {
    res.json({ processo: await workflow.reject(req.params.id, req.accessContext, actor(req), req.body?.motivo) });
  });
  router.private.post("/processos/:id/enviar", { permission: "process.send", audit: processAudit("email-enviado") }, async (req, res) => {
    res.json({ processo: await workflow.send(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.post("/processos/:id/arquivar", { permission: "process.approve", audit: processAudit("arquivado") }, async (req, res) => {
    res.json({ processo: await workflow.archive(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.post("/processos/:id/tentar-novamente", { permission: "process.retry", audit: processAudit("retentativa") }, async (req, res) => {
    res.json({ processo: await workflow.retry(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.post("/processos/:id/reprocessar", { permission: "process.reprocess", audit: processAudit("reprocessado") }, async (req, res) => {
    res.status(201).json({ processo: await workflow.reprocess(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.get("/processos/:id/pdf", { permission: "process.read" }, handleProcessPdf);
  router.private.get("/processos/:id/envio", { permission: "process.read" }, async (req, res) => {
    const invoiceProcess = await workflow.loadProcess(req.params.id, req.accessContext);
    const variables = invoiceProcess.variaveisSnapshot || {};
    const configurations = variables.configuracoes || [];
    const currentConfigurations = await resolvedConfigurations(req.accessContext.tenantId, invoiceProcess.baseOmieId);
    const internalRecipients = getConfiguration(currentConfigurations, "email-destinatarios-internos", []);
    const configuredRecipients = invoiceProcess.destinatariosEnvio || {};
    const recipients = withInternalCopies(normalizeRecipients(configuredRecipients.configured ? {
      to: configuredRecipients.to,
      cc: configuredRecipients.cc,
      bcc: configuredRecipients.bcc,
    } : {
      to: [variables.cliente?.email, variables.os?.Email?.cEnviarPara],
      cc: [getConfiguration(configurations, "email-cc"), getConfiguration(configurations, "email-copia")],
      bcc: getConfiguration(configurations, "email-bcc"),
    }), internalRecipients);
    const artifact = invoiceProcess.artefatoPdfId
      ? await Model("ArtefatoPdf").findOne({ _id: invoiceProcess.artefatoPdfId, tenantId: req.accessContext.tenantId }).lean()
      : null;
    const base = await findScopedBase(invoiceProcess.baseOmieId, req.accessContext);
    const invoice = artifact ? { filename: artifact.nomeArquivo, hash: artifact.hash, size: artifact.tamanho, source: "invoice" } : null;
    const sentAttachments = invoiceProcess.emailEnviadoEm
      ? (invoiceProcess.anexosEnviados || []).map((item) => ({
          filename: item.filename,
          hash: item.hash,
          size: item.size,
          source: item.filename === artifact?.nomeArquivo ? "invoice" : "sent",
        }))
      : [];
    const attachments = sentAttachments.length ? sentAttachments : [...(invoice ? [invoice] : [])];
    const os = variables.os || {};
    const customer = variables.cliente || {};
    const services = (Array.isArray(os.ServicosPrestados) ? os.ServicosPrestados : []).map((item, index) => {
      const quantity = Number(item.nQtde || item.nQuantidade || item.quantidade || 1);
      const unitValue = Number(item.nValUnit || item.nValorUnitario || item.nValorUnit || item.valorUnitario || 0);
      const explicitTotal = Number(item.nValTot ?? item.nValorTotal ?? item.nValorServico ?? item.valorTotal);
      const totalValue = Number.isFinite(explicitTotal) ? explicitTotal : quantity * unitValue;
      return {
        id: item.nCodServico || item.cCodServ || item.codigo || index + 1,
        code: item.cCodServ || item.nCodServico || item.codigo || "",
        description: item.cDescServ || item.cDescricao || item.descricao || item.cCodServ || `Serviço ${index + 1}`,
        quantity,
        unitValue,
        totalValue,
      };
    });
    const serviceTotal = services.reduce((sum, item) => sum + item.totalValue, 0);
    const rawTotal = Number(os?.Cabecalho?.nValorTotal ?? os?.Cabecalho?.nValorOS ?? os.nValorTotal);
    const total = Number.isFinite(rawTotal) ? rawTotal : Number(invoiceProcess.valorFatura || serviceTotal);
    res.json({
      operation: {
        supplierName: customer.razao_social || customer.nome_fantasia || customer.nome || invoiceProcess.clienteNome || "Não informado",
        document: customer.cnpj_cpf || customer.cnpj || customer.cpf || "",
        orderNumber: invoiceProcess.numeroOs,
        orderCode: invoiceProcess.codigoOs,
        baseName: base.nome,
        stage: invoiceProcess.etapa,
        status: invoiceProcess.status,
        currency: getConfiguration(configurations, "moeda-fatura") || getConfiguration(configurations, "moeda-padrao") || "BRL",
        total,
        services,
        serviceCount: Number(invoiceProcess.quantidadeServicos || services.length),
      },
      recipients,
      internalRecipients: normalizeRecipients({ cc: internalRecipients }).cc,
      recipientsConfigured: Boolean(configuredRecipients.configured),
      recipientsUpdatedAt: configuredRecipients.updatedAt || null,
      invoice,
      attachments,
      attachmentsDeferred: !invoiceProcess.emailEnviadoEm,
    });
  });

  router.private.put("/processos/:id/envio/destinatarios", { permission: "process.send", audit: processAudit("destinatarios-atualizados") }, async (req, res) => {
    const invoiceProcess = await workflow.loadProcess(req.params.id, req.accessContext);
    if (!["Aprovar processamento", "Aprovar fatura", "Enviar e-mail"].includes(invoiceProcess.etapa) || invoiceProcess.emailProviderId) {
      throw new GenericError("Os destinatários só podem ser alterados antes da confirmação do envio.", { statusCode: 409 });
    }
    const recipients = normalizeRecipients(req.body || {});
    if (recipients.invalid.length) {
      throw new GenericError(`E-mails inválidos: ${recipients.invalid.join(", ")}.`, {
        statusCode: 422,
        code: "EMAIL_RECIPIENT_INVALID",
      });
    }
    if (!recipients.to.length) {
      throw new GenericError("Informe ao menos um destinatário principal.", {
        statusCode: 422,
        code: "EMAIL_RECIPIENT_REQUIRED",
      });
    }
    const updatedAt = new Date();
    const result = await Model("ProcessoFatura").updateOne(
      {
        _id: invoiceProcess._id,
        tenantId: req.accessContext.tenantId,
        etapa: { $in: ["Aprovar processamento", "Aprovar fatura", "Enviar e-mail"] },
        emailProviderId: { $in: [null, ""] },
      },
      { $set: { destinatariosEnvio: { configured: true, ...recipients, updatedAt, updatedBy: actor(req).userId } } },
    );
    if (!result.modifiedCount) {
      throw new GenericError("O processo foi atualizado por outra operação. Reabra a fatura antes de continuar.", { statusCode: 409 });
    }
    res.json({ message: "Destinatários atualizados. Estes endereços serão usados no envio.", recipients, updatedAt });
  });

  router.private.post("/gatilhos/:id/preview", { permission: "templates.manage", audit: { entidade: "Template", acao: "preview" } }, async (req, res) => {
    res.json(await workflow.previewTrigger(req.params.id, req.accessContext, req.body || {}));
  });
  router.private.post("/templates/:id/preview", { permission: "templates.manage", audit: { entidade: "Template", acao: "preview" } }, async (req, res) => {
    res.json(await workflow.previewTemplate(req.params.id, req.accessContext, req.body || {}));
  });
  router.private.get("/templates/:id", { permission: "templates.read" }, async (req, res) => {
    const template = await Model("Template").findOne({ _id: req.params.id, tenantId: req.accessContext.tenantId });
    if (!template) throw new GenericError("Template nao encontrado.", { statusCode: 404 });
    res.json({ template });
  });
  router.private.post("/templates", { permission: "templates.manage", audit: { entidade: "Template", acao: "criado" } }, async (req, res) => {
    const input = req.body || {};
    const template = await Model("Template").create({ tenantId: req.accessContext.tenantId, codigo: input.codigo, descricao: input.descricao || input.codigo, tipo: input.tipo, versao: Number(input.versao || 1), contratoVariaveis: input.contratoVariaveis || "native-v2", conteudo: input.conteudo, status: input.status || "ativo" });
    res.status(201).json({ message: "Template criado com sucesso.", template });
  });
  router.private.put("/templates/:id", { permission: "templates.manage", audit: { entidade: "Template", acao: "atualizado" } }, async (req, res) => {
    const input = req.body || {};
    const template = await Model("Template").findOneAndUpdate({ _id: req.params.id, tenantId: req.accessContext.tenantId }, { $set: { codigo: input.codigo, descricao: input.descricao || input.codigo, tipo: input.tipo, versao: Number(input.versao || 1), contratoVariaveis: input.contratoVariaveis || "legacy-v1", conteudo: input.conteudo, status: input.status || "ativo" } }, { new: true, runValidators: true });
    if (!template) throw new GenericError("Template nao encontrado.", { statusCode: 404 });
    res.json({ message: "Template atualizado com sucesso.", template });
  });
  router.private.delete("/templates/:id", { permission: "templates.manage", audit: { entidade: "Template", acao: "excluido" } }, async (req, res) => {
    const template = await Model("Template").findOneAndDelete({ _id: req.params.id, tenantId: req.accessContext.tenantId });
    if (!template) throw new GenericError("Template nao encontrado.", { statusCode: 404 });
    res.json({ message: "Template excluido com sucesso." });
  });

  router.private.post("/imagens/upload", { permission: "templates.manage", audit: { entidade: "Imagem", acao: "upload" } }, async (req, res) => {
    const input = req.body || {};
    const contentType = String(input.contentType || "").toLowerCase();
    const allowed = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
    if (!allowed.has(contentType)) throw new GenericError("Formato de imagem nao suportado.", { statusCode: 422 });
    const conteudo = String(input.conteudo || "").replace(/^data:[^;]+;base64,/, "");
    const tamanho = Buffer.byteLength(conteudo, "base64");
    if (!conteudo || tamanho < 1 || tamanho > 5 * 1024 * 1024) {
      throw new GenericError("A imagem deve ter no maximo 5 MB.", { statusCode: 422 });
    }
    const image = await Model("Imagem").create({
      tenantId: req.accessContext.tenantId,
      codigo: String(input.codigo || "").trim(),
      descricao: String(input.descricao || "").trim(),
      nomeArquivo: String(input.nomeArquivo || "imagem").trim(),
      contentType,
      tamanho,
      conteudo,
      status: input.status === "inativo" ? "inativo" : "ativo",
    });
    res.status(201).json({ imagem: image });
  });
  router.private.get("/imagens/:id/conteudo", { permission: "templates.read" }, async (req, res) => {
    const image = await Model("Imagem").findOne({ _id: req.params.id, tenantId: req.accessContext.tenantId }).select("+conteudo");
    if (!image) throw new GenericError("Imagem nao encontrada.", { statusCode: 404 });
    res.setHeader("content-type", image.contentType);
    res.setHeader("content-length", String(image.tamanho));
    res.send(Buffer.from(image.conteudo, "base64"));
  });
  router.private.put("/imagens/:id", { permission: "templates.manage", audit: { entidade: "Imagem", acao: "atualizada" } }, async (req, res) => {
    const input = req.body || {};
    const update = { codigo: String(input.codigo || "").trim(), descricao: String(input.descricao || "").trim(), status: input.status === "inativo" ? "inativo" : "ativo" };
    if (input.conteudo) {
      const contentType = String(input.contentType || "").toLowerCase();
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(contentType)) throw new GenericError("Formato de imagem nao suportado.", { statusCode: 422 });
      const conteudo = String(input.conteudo).replace(/^data:[^;]+;base64,/, "");
      const tamanho = Buffer.byteLength(conteudo, "base64");
      if (tamanho < 1 || tamanho > 5 * 1024 * 1024) throw new GenericError("A imagem deve ter no maximo 5 MB.", { statusCode: 422 });
      Object.assign(update, { conteudo, contentType, tamanho, nomeArquivo: String(input.nomeArquivo || "imagem") });
    }
    const imagem = await Model("Imagem").findOneAndUpdate({ _id: req.params.id, tenantId: req.accessContext.tenantId }, { $set: update }, { new: true, runValidators: true });
    if (!imagem) throw new GenericError("Imagem nao encontrada.", { statusCode: 404 });
    res.json({ message: "Imagem atualizada com sucesso.", imagem });
  });
  router.private.delete("/imagens/:id", { permission: "templates.manage", audit: { entidade: "Imagem", acao: "excluida" } }, async (req, res) => {
    const imagem = await Model("Imagem").findOneAndDelete({ _id: req.params.id, tenantId: req.accessContext.tenantId });
    if (!imagem) throw new GenericError("Imagem nao encontrada.", { statusCode: 404 });
    res.json({ message: "Imagem excluida com sucesso." });
  });

  router.private.put("/configuracoes/destinatarios-internos", { permission: "settings.manage", audit: { entidade: "Configuracao", acao: "destinatarios-internos-atualizados" } }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const recipients = normalizeRecipients({ cc: req.body?.emails });
    if (recipients.invalid.length) {
      throw new GenericError(`E-mails internos inválidos: ${recipients.invalid.join(", ")}.`, {
        statusCode: 422,
        code: "INTERNAL_EMAIL_RECIPIENT_INVALID",
      });
    }
    if (!recipients.cc.length) {
      throw new GenericError("Informe ao menos um e-mail destinatário interno.", {
        statusCode: 422,
        code: "INTERNAL_EMAIL_RECIPIENT_REQUIRED",
      });
    }
    const Config = Model("Configuracao");
    const existing = await Config.findOne({
      tenantId,
      codigo: "email-destinatarios-internos",
      $or: [{ baseOmieId: null }, { baseOmieId: { $exists: false } }],
    });
    const values = {
      codigo: "email-destinatarios-internos",
      descricao: "Destinatários internos das faturas",
      tipo: "lista-emails",
      valor: recipients.cc.join("\n"),
      baseOmieId: null,
      status: "ativo",
    };
    const configuracao = existing
      ? await Config.findOneAndUpdate({ _id: existing._id, tenantId }, { $set: values }, { new: true, runValidators: true })
      : await Config.create({ tenantId, ...values });
    res.json({ message: "Destinatários internos atualizados com sucesso.", configuracao, emails: recipients.cc });
  });

  router.private.post("/configuracoes", { permission: "settings.manage", audit: { entidade: "Configuracao", acao: "criada" } }, async (req, res) => {
    const input = { ...(req.body || {}) }; if (input.baseOmieId) await findScopedBase(input.baseOmieId, req.accessContext); else delete input.baseOmieId;
    const configuracao = await Model("Configuracao").create({ tenantId: req.accessContext.tenantId, ...input });
    res.status(201).json({ configuracao });
  });
  router.private.put("/configuracoes/:id", { permission: "settings.manage", audit: { entidade: "Configuracao", acao: "atualizada" } }, async (req, res) => {
    const input = { ...(req.body || {}) }; if (input.baseOmieId) await findScopedBase(input.baseOmieId, req.accessContext); else input.baseOmieId = null;
    const configuracao = await Model("Configuracao").findOneAndUpdate({ _id: req.params.id, tenantId: req.accessContext.tenantId }, { $set: input }, { new: true, runValidators: true });
    if (!configuracao) throw new GenericError("Configuracao nao encontrada.", { statusCode: 404 }); res.json({ configuracao });
  });
  router.private.delete("/configuracoes/:id", { permission: "settings.manage", audit: { entidade: "Configuracao", acao: "excluida" } }, async (req, res) => {
    const configuracao = await Model("Configuracao").findOneAndDelete({ _id: req.params.id, tenantId: req.accessContext.tenantId });
    if (!configuracao) throw new GenericError("Configuracao nao encontrada.", { statusCode: 404 }); res.json({ message: "Configuracao excluida." });
  });
  router.private.post("/templates/obrigatorio/importar", { permission: "templates.manage", audit: { entidade: "Template", acao: "template-obrigatorio-importado" } }, async (req, res) => {
    const result = await importMandatoryTemplate(req.accessContext);
    res.status(result.created ? 201 : 200).json(result);
  });

  router.private.get("/dashboard", { permission: "dashboard.read" }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    const Process = Model("ProcessoFatura");
    const [byStage, failures, completed] = await Promise.all([
      Process.aggregate([{ $match: { tenantId } }, { $group: { _id: "$etapa", total: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Process.countDocuments({ tenantId, status: "falha" }),
      Process.countDocuments({ tenantId, status: "concluido" }),
    ]);
    res.json({ byStage: byStage.map((item) => ({ stage: item._id, total: item.total })), failures, completed });
  });
});
