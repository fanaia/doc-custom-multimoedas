"use strict";

const { capabilities, GenericError } = require("@oondemand/oon-core-back");

function assertPdf(input) {
  const pdf = Buffer.isBuffer(input) ? input : Buffer.from(input || "");
  const maxBytes = Number(process.env.PDF_MAX_BYTES || 20 * 1024 * 1024);
  if (pdf.length < 8 || pdf.length > maxBytes || !pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new GenericError("OonCore retornou arquivo PDF invalido ou acima do limite.", {
      statusCode: 502,
      code: "PDF_RENDERING_INVALID_OUTPUT",
    });
  }
  return pdf;
}

async function renderPdf(html, options = {}) {
  if (!capabilities?.pdf?.render) {
    throw new GenericError("A versão instalada do OonCore não oferece pdfRendering.", {
      statusCode: 503,
      code: "PDF_RENDERING_CORE_UNAVAILABLE",
    });
  }
  return assertPdf(await capabilities.pdf.render({ html, format: "A4", printBackground: true }, options.context || {}));
}

module.exports = { assertPdf, renderPdf };
