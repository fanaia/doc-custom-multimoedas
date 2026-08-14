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

defineRoutes("/api/doc-custom", (router) => {
  router.public.post("/webhooks/omie/:token", async (req, res) => {
    const result = await receiveWebhook(req.params.token, req.body || {});
    res.status(200).json(result);
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
    res.json({ results: stages, synchronizedAt: now });
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
