"use strict";

const {
  GenericError,
  defineRoutes,
  registry,
} = require("@oondemand/oon-core-back");
const { configureCredentials, findScopedBase, getWebhookAccess, rotateWebhook } = require("../services/baseCredentials");
const { getConfiguration } = require("../services/configuration");
const gateway = require("../services/integrations/omieGateway");
const workflow = require("../services/invoiceWorkflow");
const { importMandatoryTemplate } = require("../services/mandatoryTemplate");
const { normalizeRecipients } = require("../services/recipients");
const { errorSummary } = require("../services/sanitization");
const { receiveWebhook } = require("../services/webhookService");

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

defineRoutes("/api/doc-custom", (router) => {
  router.public.post("/webhooks/omie/:token", async (req, res) => {
    const result = await receiveWebhook(req.params.token, req.body || {});
    res.status(200).json(result);
  });

  router.private.get("/operacao/catalogos", { permission: "dashboard.read" }, async (req, res) => {
    const tenantId = req.accessContext.tenantId;
    await ensureDefaultCurrencies(tenantId);
    const [bases, imagens, templates, documentos, configuracoes, etapas, categorias, contasCorrentes, gatilhos, mapeamentos] = await Promise.all([
      Model("BaseOmie").find({ tenantId }).sort({ nome: 1 }).lean(),
      Model("Imagem").find({ tenantId }).sort({ updatedAt: -1 }).lean(),
      Model("Template").find({ tenantId }).select("codigo descricao tipo versao status updatedAt").sort({ updatedAt: -1 }).lean(),
      Model("ArtefatoPdf").find({ tenantId }).sort({ geradoEm: -1 }).limit(100).lean(),
      Model("Configuracao").find({ tenantId }).populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("EtapaOmie").find({ tenantId }).select("baseOmieId codigo descricao status sincronizadaEm").populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("CategoriaOmie").find({ tenantId }).select("baseOmieId codigo descricao status sincronizadaEm").populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("ContaCorrenteOmie").find({ tenantId }).select("baseOmieId codigo descricao banco status sincronizadaEm").populate("baseOmieId", "nome codigo").sort({ codigo: 1 }).lean(),
      Model("Gatilho").find({ tenantId }).populate("templateDocumentoId templateAssuntoId templateCorpoId", "codigo descricao tipo versao").sort({ descricao: 1 }).lean(),
      Model("GatilhoBase").find({ tenantId }).populate("baseOmieId", "nome codigo").sort({ createdAt: 1 }).lean(),
    ]);
    res.json({ bases, imagens, templates, documentos, configuracoes, etapas, categorias, contasCorrentes, gatilhos, mapeamentos });
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
  router.private.post("/processos/:id/tentar-novamente", { permission: "process.retry", audit: processAudit("retentativa") }, async (req, res) => {
    res.json({ processo: await workflow.retry(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.post("/processos/:id/reprocessar", { permission: "process.reprocess", audit: processAudit("reprocessado") }, async (req, res) => {
    res.status(201).json({ processo: await workflow.reprocess(req.params.id, req.accessContext, actor(req)) });
  });
  router.private.get("/processos/:id/pdf", { permission: "process.read" }, async (req, res) => {
    const process = await workflow.loadProcess(req.params.id, req.accessContext);
    const artifact = await Model("ArtefatoPdf").findOne({ _id: process.artefatoPdfId, tenantId: req.accessContext.tenantId })
      .select("+conteudoBase64");
    if (!artifact) throw new GenericError("PDF nao encontrado.", { statusCode: 404 });
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${artifact.nomeArquivo.replace(/[\"\r\n]/g, "-")}"`);
    res.setHeader("etag", `"${artifact.hash}"`);
    res.send(Buffer.from(artifact.conteudoBase64, "base64"));
  });
  router.private.get("/processos/:id/envio", { permission: "process.read" }, async (req, res) => {
    const process = await workflow.loadProcess(req.params.id, req.accessContext);
    const variables = process.variaveisSnapshot || {};
    const configurations = variables.configuracoes || [];
    const recipients = normalizeRecipients({
      to: [variables.cliente?.email, variables.os?.Email?.cEnviarPara],
      cc: [getConfiguration(configurations, "email-cc"), getConfiguration(configurations, "email-copia")],
      bcc: getConfiguration(configurations, "email-bcc"),
    });
    const artifact = process.artefatoPdfId
      ? await Model("ArtefatoPdf").findOne({ _id: process.artefatoPdfId, tenantId: req.accessContext.tenantId }).lean()
      : null;
    const base = await findScopedBase(process.baseOmieId, req.accessContext, { secrets: true });
    const listed = await gateway.listarAnexos(base, req.accessContext, process.codigoOs);
    const invoice = artifact ? { filename: artifact.nomeArquivo, hash: artifact.hash, size: artifact.tamanho, source: "invoice" } : null;
    const attachments = (listed?.listaAnexos || [])
      .filter((item) => item.cNomeArquivo !== artifact?.nomeArquivo)
      .map((item) => ({
        id: item.nIdAnexo,
        filename: item.cNomeArquivo || `anexo-${item.nIdAnexo}`,
        size: item.nTamanho || item.nTamanhoArquivo || null,
        source: "omie",
      }));
    res.json({ recipients, invoice, attachments: [...(invoice ? [invoice] : []), ...attachments] });
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
    const template = await Model("Template").create({ tenantId: req.accessContext.tenantId, codigo: input.codigo, descricao: input.descricao || input.codigo, tipo: input.tipo, versao: Number(input.versao || 1), conteudo: input.conteudo, status: input.status || "ativo" });
    res.status(201).json({ message: "Template criado com sucesso.", template });
  });
  router.private.put("/templates/:id", { permission: "templates.manage", audit: { entidade: "Template", acao: "atualizado" } }, async (req, res) => {
    const input = req.body || {};
    const template = await Model("Template").findOneAndUpdate({ _id: req.params.id, tenantId: req.accessContext.tenantId }, { $set: { codigo: input.codigo, descricao: input.descricao || input.codigo, tipo: input.tipo, versao: Number(input.versao || 1), conteudo: input.conteudo, status: input.status || "ativo" } }, { new: true, runValidators: true });
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
