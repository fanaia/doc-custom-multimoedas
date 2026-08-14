"use strict";

const { GenericError } = require("@oondemand/oon-core-back");
const gateway = require("./integrations/omieGateway");
const { sha256Buffer } = require("./security");

async function collectOmieAttachments({ base, accessContext, os, generated, adapters = {} }) {
  const omie = adapters.gateway || gateway;
  const listed = await omie.listarAnexos(base, accessContext, os.Cabecalho.nCodOS, adapters);
  const output = [];
  const maxBytes = Number(process.env.EMAIL_MAX_TOTAL_BYTES || 20 * 1024 * 1024);
  let total = generated.buffer.length;
  for (const item of listed?.listaAnexos || []) {
    const metadata = await omie.obterAnexo(base, accessContext, item, adapters);
    const filename = String(metadata?.cNomeArquivo || item?.cNomeArquivo || `anexo-${item.nIdAnexo}`);
    if (filename === generated.filename) continue;
    if (!metadata?.cLinkDownload) throw new GenericError(`Anexo ${filename} sem link de download.`, { statusCode: 422 });
    const buffer = await omie.downloadAttachment(metadata.cLinkDownload, adapters);
    const hash = sha256Buffer(buffer);
    if (hash === generated.hash || output.some((candidate) => candidate.hash === hash)) continue;
    total += buffer.length;
    if (total > maxBytes) {
      throw new GenericError(`Anexos excedem o limite de ${maxBytes} bytes; nenhum e-mail foi enviado.`, {
        statusCode: 422,
        code: "EMAIL_ATTACHMENTS_TOO_LARGE",
      });
    }
    output.push({ filename, contentType: metadata.cContentType || "application/octet-stream", buffer, hash });
  }
  return output;
}

module.exports = { collectOmieAttachments };
