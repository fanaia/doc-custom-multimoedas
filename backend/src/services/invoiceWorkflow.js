"use strict";

const { GenericError, registry, scopedIdFilter } = require("@oondemand/oon-core-back");
const { collectOmieAttachments } = require("./attachments");
const { findScopedBase } = require("./baseCredentials");
const { getConfiguration } = require("./configuration");
const { sendEmail } = require("./emailSender");
const { credentials: sendgridCredentials } = require("./sendgridCredentials");
const gateway = require("./integrations/omieGateway");
const { buildVariables } = require("./invoiceVariables");
const { renderPdf } = require("./pdfRenderer");
const { normalizeRecipients } = require("./recipients");
const { generateToken, sha256Buffer } = require("./security");
const { errorSummary, sanitize } = require("./sanitization");
const { renderTemplate } = require("./templateRenderer");

function Model(name) {
  return registry.getModel(name).mongooseModel;
}

function internalAccess(tenantId) {
  return { tenantId: String(tenantId), tenancyModel: "multi_tenant", userId: "system" };
}

async function loadProcess(id, accessContext, options = {}) {
  let query = Model("ProcessoFatura").findOne(scopedIdFilter(registry.getModel("ProcessoFatura"), id, accessContext));
  if (options.secrets) query = query.select("+tenantId +idempotencyKey +lockToken");
  else query = query.select("+tenantId");
  const process = await query;
  if (!process) throw new GenericError("Processo nao encontrado neste tenant.", { statusCode: 404 });
  return process;
}

async function recordEvent(process, input) {
  const started = input.startedAt || new Date();
  const finished = input.finishedAt || new Date();
  return Model("EventoProcesso").create({
    tenantId: String(process.tenantId),
    processoId: process._id,
    etapa: input.stage || process.etapa,
    tentativa: Number(input.attempt || process.tentativas || 1),
    resultado: input.result,
    iniciadoEm: started,
    finalizadoEm: finished,
    duracaoMs: Math.max(0, finished.getTime() - started.getTime()),
    usuarioId: input.userId || "system",
    codigoErro: input.error?.code || "",
    mensagem: String(input.message || input.error?.message || "").slice(0, 1000),
    detalhes: sanitize(input.details || {}),
  });
}

async function acquireLock(id, accessContext) {
  const now = new Date();
  const token = generateToken(18);
  const lockMs = Math.max(120_000, Number(process.env.PROCESS_LOCK_MS || 15 * 60_000));
  const process = await Model("ProcessoFatura").findOneAndUpdate({
    ...scopedIdFilter(registry.getModel("ProcessoFatura"), id, accessContext),
    $or: [{ lockUntil: null }, { lockUntil: { $exists: false } }, { lockUntil: { $lt: now } }],
  }, {
    $set: { lockToken: token, lockUntil: new Date(now.getTime() + lockMs) },
    $inc: { tentativas: 1 },
  }, { new: true }).select("+tenantId +lockToken");
  if (!process) throw new GenericError("Processo em execucao; aguarde antes de tentar novamente.", {
    statusCode: 409,
    code: "PROCESS_LOCKED",
  });
  return { process, token };
}

async function releaseLock(process, token) {
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId, lockToken: token }, {
    $unset: { lockToken: 1, lockUntil: 1 },
  });
}

async function withLock(id, accessContext, task) {
  const { process, token } = await acquireLock(id, accessContext);
  try {
    return await task(process);
  } finally {
    await releaseLock(process, token);
  }
}

async function loadTriggerContext(process, accessContext) {
  const [base, trigger, mapping] = await Promise.all([
    findScopedBase(process.baseOmieId, accessContext, { secrets: true }),
    Model("Gatilho").findOne({ _id: process.gatilhoId, tenantId: process.tenantId }),
    Model("GatilhoBase").findOne({ _id: process.gatilhoBaseId, tenantId: process.tenantId }),
  ]);
  if (!trigger || !mapping) throw new GenericError("Gatilho do processo nao esta mais disponivel.", { statusCode: 422 });
  return { base, trigger, mapping };
}

async function loadTemplates(trigger, tenantId) {
  const ids = [trigger.templateDocumentoId, trigger.templateAssuntoId, trigger.templateCorpoId];
  const templates = await Model("Template").find({ _id: { $in: ids }, tenantId, status: "ativo" }).lean();
  const byId = new Map(templates.map((item) => [String(item._id), item]));
  const document = byId.get(String(trigger.templateDocumentoId));
  const subject = byId.get(String(trigger.templateAssuntoId));
  const body = byId.get(String(trigger.templateCorpoId));
  if (!document || document.tipo !== "documento" || !subject || subject.tipo !== "assunto" || !body || body.tipo !== "corpo-email") {
    throw new GenericError("Templates ativos do gatilho estao incompletos ou com tipos invalidos.", {
      statusCode: 422,
      code: "TRIGGER_TEMPLATES_INVALID",
    });
  }
  return { document, subject, body };
}

function templateSnapshot(templates) {
  return Object.fromEntries(Object.entries(templates).map(([key, item]) => [key, {
    id: String(item._id), codigo: item.codigo, versao: item.versao, tipo: item.tipo, conteudo: item.conteudo,
  }]));
}

function invoiceFilename(number) {
  return `invoice-${String(number).replace(/[^a-z0-9._-]/gi, "-")}-${new Date().toISOString().replace(/[:.]/g, "-")}.pdf`;
}

async function generateInvoice(process, actor, adapters = {}) {
  const startedAt = new Date();
  const accessContext = internalAccess(process.tenantId);
  const { base, trigger } = await loadTriggerContext(process, accessContext);
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
    $set: { etapa: "Gerar fatura", status: "ativo", falhaNaEtapa: "", ultimoErro: {} },
  });
  const variables = await (adapters.buildVariables || buildVariables)({
    tenantId: String(process.tenantId),
    base,
    codigoOs: process.codigoOs,
    processoId: process._id,
    accessContext,
    adapters,
  });
  const templates = await loadTemplates(trigger, process.tenantId);
  const html = renderTemplate(templates.document.conteudo, variables, adapters.templateOptions);
  const subject = renderTemplate(templates.subject.conteudo, variables, adapters.templateOptions);
  const body = renderTemplate(templates.body.conteudo, variables, adapters.templateOptions);
  const pdf = await (adapters.renderPdf || renderPdf)(html, adapters);
  const hash = sha256Buffer(pdf);
  const filename = invoiceFilename(variables.os.Cabecalho.cNumOS);
  const artifact = await Model("ArtefatoPdf").findOneAndUpdate(
    { tenantId: process.tenantId, processoId: process._id },
    { $setOnInsert: {
      tenantId: process.tenantId,
      processoId: process._id,
      nomeArquivo: filename,
      hash,
      tamanho: pdf.length,
      conteudoBase64: pdf.toString("base64"),
      templateCodigo: templates.document.codigo,
      templateVersao: templates.document.versao,
      htmlSnapshot: html,
      geradoEm: new Date(),
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const warnings = variables.moedas.map((item) => item.alerta).filter(Boolean);
  if (!process.env.PDF_RENDERER_URL) warnings.push("PDF gerado pelo renderer de contingencia; configure PDF_RENDERER_URL para fidelidade HTML/CSS.");
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
    $set: {
      etapa: "Aprovar fatura",
      status: "ativo",
      numeroOs: String(variables.os.Cabecalho.cNumOS),
      clienteNome: String(variables.cliente.nome_fantasia || variables.cliente.razao_social || ""),
      artefatoPdfId: artifact._id,
      pdfHash: artifact.hash,
      cotacoesUsadas: variables.moedas,
      templateSnapshot: templateSnapshot(templates),
      variaveisSnapshot: variables,
      emailSnapshot: { subject, body },
      alerta: warnings.join(" "),
    },
  });
  await recordEvent(process, {
    stage: "Gerar fatura",
    result: "sucesso",
    startedAt,
    userId: actor.userId,
    details: { pdfHash: hash, filename, cotacoes: variables.moedas },
  });
  return loadProcess(process._id, accessContext);
}

async function attachInvoice(process, actor, adapters = {}) {
  const startedAt = new Date();
  const accessContext = internalAccess(process.tenantId);
  if (process.omieAnexoId) {
    await recordEvent(process, { stage: "Anexar no Omie", result: "ignorado", startedAt, userId: actor.userId, message: "PDF ja anexado." });
    return process;
  }
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, { $set: { etapa: "Anexar no Omie" } });
  const { base } = await loadTriggerContext(process, accessContext);
  const artifact = await Model("ArtefatoPdf").findOne({ _id: process.artefatoPdfId, tenantId: process.tenantId })
    .select("+conteudoBase64");
  if (!artifact) throw new GenericError("PDF do processo nao encontrado.", { statusCode: 422 });
  const variables = process.variaveisSnapshot || {};
  const response = await (adapters.gateway || gateway).incluirPdf(
    base,
    accessContext,
    variables.os,
    artifact.nomeArquivo,
    Buffer.from(artifact.conteudoBase64, "base64"),
    adapters,
  );
  const attachmentId = String(response?.nIdAnexo || response?.cCodIntAnexo || response?.cCodStatus || `sha256:${artifact.hash}`);
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId, omieAnexoId: { $in: [null, ""] } }, {
    $set: { omieAnexoId: attachmentId, etapa: "Enviar e-mail", status: "ativo" },
  });
  await recordEvent(process, {
    stage: "Anexar no Omie", result: "sucesso", startedAt, userId: actor.userId,
    details: { attachmentId, pdfHash: artifact.hash },
  });
  return loadProcess(process._id, accessContext);
}

async function finalizeOmieStatus(process, actor, adapters = {}) {
  const startedAt = new Date();
  const accessContext = internalAccess(process.tenantId);
  if (process.statusOmieAtualizadoEm) return process;
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, { $set: { etapa: "Atualizar status Omie" } });
  const { base, mapping } = await loadTriggerContext(process, accessContext);
  const variables = process.variaveisSnapshot || {};
  const sentAt = process.emailEnviadoEm ? new Date(process.emailEnviadoEm) : new Date();
  const note = `Invoice enviada em ${sentAt.toLocaleString("pt-BR")} para ${(process.destinatarios || []).join(", ")}.`;
  await (adapters.gateway || gateway).atualizarEtapa(base, accessContext, process.codigoOs, mapping.etapaSucesso, note, adapters);
  const completedAt = new Date();
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
    $set: { etapa: "Concluido", status: "concluido", statusOmieAtualizadoEm: completedAt, concluidoEm: completedAt },
  });
  await recordEvent(process, { stage: "Atualizar status Omie", result: "sucesso", startedAt, userId: actor.userId, details: { etapa: mapping.etapaSucesso } });
  await recordEvent(process, { stage: "Concluido", result: "sucesso", startedAt: completedAt, userId: actor.userId });
  return loadProcess(process._id, accessContext);
}

async function sendInvoice(process, actor, adapters = {}) {
  const startedAt = new Date();
  const accessContext = internalAccess(process.tenantId);
  let current = await loadProcess(process._id, accessContext);
  if (!current.emailProviderId) {
    await Model("ProcessoFatura").updateOne({ _id: current._id, tenantId: current.tenantId }, { $set: { etapa: "Enviar e-mail" } });
    const { base } = await loadTriggerContext(current, accessContext);
    const artifact = await Model("ArtefatoPdf").findOne({ _id: current.artefatoPdfId, tenantId: current.tenantId })
      .select("+conteudoBase64");
    if (!artifact) throw new GenericError("PDF aprovado nao encontrado.", { statusCode: 422 });
    const variables = current.variaveisSnapshot || {};
    const configurations = variables.configuracoes || [];
    const recipients = normalizeRecipients({
      to: [variables.cliente?.email, variables.os?.Email?.cEnviarPara],
      cc: [getConfiguration(configurations, "email-cc"), getConfiguration(configurations, "email-copia")],
      bcc: getConfiguration(configurations, "email-bcc"),
    });
    if (recipients.invalid.length) throw new GenericError(
      `Destinatarios invalidos: ${recipients.invalid.join(", ")}.`,
      { statusCode: 422, code: "EMAIL_RECIPIENT_INVALID" },
    );
    if (!recipients.to.length) throw new GenericError("OS/cliente sem e-mail valido para envio.", {
      statusCode: 422,
      code: "EMAIL_RECIPIENT_REQUIRED",
    });
    const generated = {
      filename: artifact.nomeArquivo,
      buffer: Buffer.from(artifact.conteudoBase64, "base64"),
      hash: artifact.hash,
    };
    const omieAttachments = await (adapters.collectAttachments || collectOmieAttachments)({
      base, accessContext, os: variables.os, generated, adapters,
    });
    const allAttachments = [
      { filename: generated.filename, contentType: "application/pdf", buffer: generated.buffer, hash: generated.hash },
      ...omieAttachments,
    ];
    const sendgrid = adapters.sendEmail ? null : await sendgridCredentials(current.tenantId);
    const result = await (adapters.sendEmail || sendEmail)({
      from: {
        email: getConfiguration(configurations, "email-from") || sendgrid?.from.email,
        name: getConfiguration(configurations, "email-from-nome") || sendgrid?.from.name,
      },
      ...recipients,
      subject: current.emailSnapshot?.subject || "Invoice",
      html: current.emailSnapshot?.body || "",
      attachments: allAttachments.map((item) => ({
        filename: item.filename,
        contentType: item.contentType,
        contentBase64: item.buffer.toString("base64"),
      })),
    }, { ...adapters, apiKey: sendgrid?.apiKey, tenantId: current.tenantId, processoId: current._id });
    const sentAt = result.acceptedAt || new Date();
    await Model("ProcessoFatura").updateOne({ _id: current._id, tenantId: current.tenantId, emailProviderId: { $in: [null, ""] } }, {
      $set: {
        emailProviderId: result.id,
        emailEnviadoEm: sentAt,
        destinatarios: [...recipients.to, ...recipients.cc, ...recipients.bcc],
        anexosEnviados: allAttachments.map((item) => ({ filename: item.filename, hash: item.hash, size: item.buffer.length })),
      },
    });
    await recordEvent(current, {
      stage: "Enviar e-mail", result: "sucesso", startedAt, userId: actor.userId,
      details: { providerId: result.id, recipients, attachments: allAttachments.map((item) => ({ filename: item.filename, hash: item.hash })) },
    });
    current = await loadProcess(current._id, accessContext);
  } else {
    await recordEvent(current, { stage: "Enviar e-mail", result: "ignorado", startedAt, userId: actor.userId, message: "E-mail ja confirmado pelo provedor." });
  }
  return finalizeOmieStatus(current, actor, adapters);
}

async function failProcess(process, stage, error, actor, adapters = {}) {
  const summary = errorSummary(error);
  await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
    $set: { etapa: "Falha", status: "falha", falhaNaEtapa: stage, ultimoErro: summary },
  });
  await recordEvent(process, { stage, result: "falha", error: summary, userId: actor.userId });
  try {
    const accessContext = internalAccess(process.tenantId);
    const { base, mapping } = await loadTriggerContext(process, accessContext);
    await (adapters.gateway || gateway).atualizarEtapa(
      base, accessContext, process.codigoOs, mapping.etapaErro,
      `Falha na geracao/envio da invoice: ${summary.message}`, adapters,
    );
  } catch (stageError) {
    await recordEvent(process, {
      stage: "Atualizar status Omie", result: "falha", error: errorSummary(stageError),
      userId: actor.userId, message: "Nao foi possivel mover a OS para a etapa de erro.",
    });
  }
}

async function approveProcessing(id, accessContext, actor, adapters = {}) {
  return withLock(id, accessContext, async (process) => {
    if (process.etapa !== "Aprovar processamento") throw new GenericError("Processo nao aguarda aprovacao de processamento.", { statusCode: 409 });
    await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
      $set: { aprovadoProcessamentoEm: new Date(), aprovadoProcessamentoPor: actor.userId },
    });
    await recordEvent(process, { stage: "Aprovar processamento", result: "sucesso", userId: actor.userId });
    try { return await generateInvoice(process, actor, adapters); }
    catch (error) { await failProcess(process, "Gerar fatura", error, actor, adapters); throw error; }
  });
}

async function approveInvoice(id, accessContext, actor, adapters = {}) {
  return withLock(id, accessContext, async (process) => {
    if (process.etapa !== "Aprovar fatura") throw new GenericError("Processo nao aguarda aprovacao da fatura.", { statusCode: 409 });
    await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
      $set: { aprovadoFaturaEm: new Date(), aprovadoFaturaPor: actor.userId },
    });
    await recordEvent(process, { stage: "Aprovar fatura", result: "sucesso", userId: actor.userId });
    try { return await attachInvoice(process, actor, adapters); }
    catch (error) { await failProcess(process, "Anexar no Omie", error, actor, adapters); throw error; }
  });
}

async function send(id, accessContext, actor, adapters = {}) {
  return withLock(id, accessContext, async (process) => {
    if (process.etapa !== "Enviar e-mail") throw new GenericError("Processo nao esta pronto para envio.", { statusCode: 409 });
    try { return await sendInvoice(process, actor, adapters); }
    catch (error) {
      const current = await loadProcess(process._id, internalAccess(process.tenantId));
      await failProcess(current, current.emailProviderId ? "Atualizar status Omie" : "Enviar e-mail", error, actor, adapters);
      throw error;
    }
  });
}

async function retry(id, accessContext, actor, adapters = {}) {
  return withLock(id, accessContext, async (process) => {
    if (process.etapa !== "Falha") throw new GenericError("Somente processos com falha podem ser retomados.", { statusCode: 409 });
    try {
      if (process.falhaNaEtapa === "Gerar fatura") return generateInvoice(process, actor, adapters);
      if (process.falhaNaEtapa === "Anexar no Omie") return attachInvoice(process, actor, adapters);
      if (process.falhaNaEtapa === "Enviar e-mail" || process.falhaNaEtapa === "Atualizar status Omie") return sendInvoice(process, actor, adapters);
      throw new GenericError(`Etapa de falha desconhecida: ${process.falhaNaEtapa}.`, { statusCode: 422 });
    } catch (error) {
      await failProcess(process, process.falhaNaEtapa || "Retentativa", error, actor, adapters);
      throw error;
    }
  });
}

async function reject(id, accessContext, actor, reason) {
  return withLock(id, accessContext, async (process) => {
    if (!["Aprovar processamento", "Aprovar fatura"].includes(process.etapa)) {
      throw new GenericError("A etapa atual nao aceita rejeicao.", { statusCode: 409 });
    }
    const text = String(reason || "").trim();
    if (!text) throw new GenericError("Informe o motivo da rejeicao.", { statusCode: 422 });
    const now = new Date();
    await Model("ProcessoFatura").updateOne({ _id: process._id, tenantId: process.tenantId }, {
      $set: { etapa: "Rejeitado", status: "rejeitado", rejeitadoEm: now, rejeitadoPor: actor.userId, motivoRejeicao: text, concluidoEm: now },
    });
    await recordEvent(process, { stage: process.etapa, result: "rejeitado", userId: actor.userId, message: text });
    return loadProcess(process._id, accessContext);
  });
}

async function reprocess(id, accessContext, actor) {
  return withLock(id, accessContext, async (previous) => {
    const existing = await Model("ProcessoFatura").findOne({
      tenantId: previous.tenantId,
      processoAnteriorId: previous._id,
    });
    if (existing) return existing;
    let created;
    try {
      created = await Model("ProcessoFatura").create({
        tenantId: previous.tenantId,
        baseOmieId: previous.baseOmieId,
        gatilhoId: previous.gatilhoId,
        gatilhoBaseId: previous.gatilhoBaseId,
        processoAnteriorId: previous._id,
        idempotencyKey: `reprocess:${previous.tenantId}:${previous._id}`,
        eventoExternoId: `reprocess:${previous._id}`,
        codigoOs: previous.codigoOs,
        numeroOs: previous.numeroOs,
        clienteNome: previous.clienteNome,
        etapa: "Aprovar processamento",
        status: "ativo",
        iniciadoEm: new Date(),
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      created = await Model("ProcessoFatura").findOne({
        tenantId: previous.tenantId,
        processoAnteriorId: previous._id,
      });
    }
    await recordEvent(created, { stage: "Aprovar processamento", result: "iniciado", userId: actor.userId, details: { previousProcessId: String(previous._id) } });
    return created;
  });
}

async function previewTrigger(triggerId, accessContext, input, adapters = {}) {
  const trigger = await Model("Gatilho").findOne({ _id: triggerId, tenantId: accessContext.tenantId, status: "ativo" });
  if (!trigger) throw new GenericError("Gatilho ativo nao encontrado.", { statusCode: 404 });
  const base = await findScopedBase(input.baseOmieId, accessContext, { secrets: true });
  const templates = await loadTemplates(trigger, accessContext.tenantId);
  const variables = await (adapters.buildVariables || buildVariables)({
    tenantId: accessContext.tenantId,
    base,
    codigoOs: input.codigoOs,
    numeroOs: input.numeroOs,
    accessContext,
    adapters,
  });
  const html = renderTemplate(templates.document.conteudo, variables, adapters.templateOptions);
  const subject = renderTemplate(templates.subject.conteudo, variables, adapters.templateOptions);
  const body = renderTemplate(templates.body.conteudo, variables, adapters.templateOptions);
  const pdf = await (adapters.renderPdf || renderPdf)(html, adapters);
  return { html, subject, body, pdfBase64: pdf.toString("base64"), variables: sanitize(variables) };
}

async function previewTemplate(templateId, accessContext, input, adapters = {}) {
  const template = await Model("Template").findOne({
    _id: templateId,
    tenantId: accessContext.tenantId,
    status: "ativo",
  });
  if (!template) throw new GenericError("Template ativo nao encontrado.", { statusCode: 404 });
  const base = await findScopedBase(input.baseOmieId, accessContext, { secrets: true });
  const variables = await (adapters.buildVariables || buildVariables)({
    tenantId: accessContext.tenantId,
    base,
    numeroOs: input.numeroOs || input.codigoOs,
    accessContext,
    adapters,
  });
  const rendered = renderTemplate(template.conteudo, variables, adapters.templateOptions);
  const result = { rendered, variables: sanitize(variables), tipo: template.tipo };
  if (template.tipo === "documento") {
    const pdf = await (adapters.renderPdf || renderPdf)(rendered, adapters);
    result.html = rendered;
    result.pdfBase64 = pdf.toString("base64");
  }
  return result;
}

module.exports = {
  approveInvoice,
  approveProcessing,
  attachInvoice,
  finalizeOmieStatus,
  generateInvoice,
  internalAccess,
  loadProcess,
  previewTrigger,
  previewTemplate,
  reject,
  reprocess,
  retry,
  send,
  sendInvoice,
};
