"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const { isValidEmail } = require("./recipients");
const tickets = require("./integrationTickets");

function attachmentBytes(attachments = []) {
  return attachments.reduce((total, item) => total + Buffer.byteLength(item.contentBase64 || "", "base64"), 0);
}

async function sendEmail(message, options = {}) {
  const apiKey = String(options.apiKey || "").trim();
  if (!apiKey) throw new GenericError("Configure a integração SendGrid para este tenant.", {
    statusCode: 503,
    code: "EMAIL_PROVIDER_REQUIRED",
  });
  const maxBytes = Number(process.env.EMAIL_MAX_TOTAL_BYTES || 20 * 1024 * 1024);
  const bytes = attachmentBytes(message.attachments);
  if (bytes > maxBytes) {
    throw new GenericError(`Anexos somam ${bytes} bytes e excedem o limite de ${maxBytes} bytes.`, {
      statusCode: 422,
      code: "EMAIL_ATTACHMENTS_TOO_LARGE",
    });
  }
  if (!message.to?.length) throw new GenericError("Nenhum destinatario valido informado.", {
    statusCode: 422,
    code: "EMAIL_RECIPIENT_REQUIRED",
  });
  if (!isValidEmail(message.from?.email)) throw new GenericError("Configure um remetente de e-mail valido.", {
    statusCode: 422,
    code: "EMAIL_SENDER_INVALID",
  });
  const attachments = (message.attachments || []).map((item) => ({
    content: item.contentBase64,
    filename: item.filename,
    type: item.contentType || "application/octet-stream",
    disposition: "attachment",
  }));
  const payload = {
    personalizations: [{
      to: message.to.map((email) => ({ email })),
      ...(message.cc?.length ? { cc: message.cc.map((email) => ({ email })) } : {}),
      ...(message.bcc?.length ? { bcc: message.bcc.map((email) => ({ email })) } : {}),
    }],
    from: { email: message.from.email, ...(message.from.name ? { name: message.from.name } : {}) },
    subject: message.subject,
    content: [{ type: "text/html", value: message.html }],
    ...(attachments.length ? { attachments } : {}),
  };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const ticket = options.tenantId ? await tickets.start({ tenantId: options.tenantId, provider: "sendgrid", operacao: "mail.send", processoId: options.processoId, requisicao: { to: message.to, cc: message.cc, bcc: message.bcc, subject: message.subject, attachments: (payload.attachments || []).map(item => ({ filename: item.filename, type: item.type })) } }) : null;
  try {
    const response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      let providerMessage = "";
      try {
        const body = await response.json();
        providerMessage = (body?.errors || []).map((item) => String(item?.message || "")).filter(Boolean).join(" ");
      } catch {
        providerMessage = "";
      }
      const details = providerMessage ? `: ${providerMessage.slice(0, 500)}` : "";
      throw new GenericError(`Provedor de e-mail recusou o envio (HTTP ${response.status})${details}.`, {
        statusCode: 502,
        code: "EMAIL_PROVIDER_ERROR",
      });
    }
    const id = response.headers.get("x-message-id") || response.headers.get("x-request-id") || "accepted";
    await tickets.success(ticket, { resposta: { httpStatus: response.status }, codigoExterno: id });
    return { provider: "sendgrid", id, acceptedAt: new Date() };
  } catch (error) {
    await tickets.failure(ticket, error);
    throw error;
  }
}

module.exports = { attachmentBytes, sendEmail };
