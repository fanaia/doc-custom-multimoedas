"use strict";

const { GenericError } = require("@oondemand/oon-core-back");

function escapePdfText(value) {
  return String(value || "").replace(/[\\()]/g, "\\$&");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>|<\/tr>|<\/div>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function fallbackPdf(html) {
  const lines = stripHtml(html).split("\n").flatMap((line) => {
    const result = [];
    for (let index = 0; index < line.length; index += 95) result.push(line.slice(index, index + 95));
    return result;
  }).slice(0, 58);
  const stream = ["BT", "/F1 9 Tf", "40 800 Td"];
  lines.forEach((line, index) => {
    if (index) stream.push("0 -13 Td");
    stream.push(`(${escapePdfText(line)}) Tj`);
  });
  stream.push("ET");
  const content = stream.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function assertPdf(input) {
  const pdf = Buffer.isBuffer(input) ? input : Buffer.from(input || "");
  const maxBytes = Number(process.env.PDF_MAX_BYTES || 20 * 1024 * 1024);
  if (pdf.length < 8 || pdf.length > maxBytes || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new GenericError("Renderer PDF retornou arquivo invalido ou acima do limite.", {
      statusCode: 502,
      code: "PDF_RENDERER_INVALID_OUTPUT",
    });
  }
  return pdf;
}

async function remotePdf(html, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(process.env.PDF_RENDERER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.PDF_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.PDF_RENDERER_TOKEN}` } : {}),
    },
    body: JSON.stringify({ html, options: { format: "A4", printBackground: true } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new GenericError(`Renderer PDF indisponivel (HTTP ${response.status}).`, {
      statusCode: 502,
      code: "PDF_RENDERER_ERROR",
    });
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/pdf")) return Buffer.from(await response.arrayBuffer());
  const result = await response.json();
  if (!result?.pdfBase64) throw new GenericError("Renderer PDF retornou resposta invalida.", { statusCode: 502 });
  return Buffer.from(result.pdfBase64, "base64");
}

function remoteRendererConfigured() {
  return Boolean(process.env.PDF_RENDERER_URL);
}

function usesFallbackPdf(options = {}) {
  return !options.renderPdf && !remoteRendererConfigured();
}

async function renderPdf(html, options = {}) {
  if (remoteRendererConfigured()) return assertPdf(await remotePdf(html, options.fetchImpl));
  if (String(process.env.PDF_REQUIRE_RENDERER || "false").toLowerCase() === "true") {
    throw new GenericError("Configure PDF_RENDERER_URL para gerar o documento.", {
      statusCode: 503,
      code: "PDF_RENDERER_REQUIRED",
    });
  }
  return assertPdf(fallbackPdf(html));
}

module.exports = { assertPdf, fallbackPdf, remoteRendererConfigured, renderPdf, stripHtml, usesFallbackPdf };
