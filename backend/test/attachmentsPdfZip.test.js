"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const zlib = require("node:zlib");
const { collectOmieAttachments } = require("../src/services/attachments");
const { attachmentBytes, sendEmail } = require("../src/services/emailSender");
const { assertPdf, fallbackPdf, stripHtml } = require("../src/services/pdfRenderer");
const { sha256Buffer } = require("../src/services/security");
const { crc32, zipSingleFile } = require("../src/services/zipFile");

test("PDF de contingência é válido e preserva conteúdo textual", () => {
  assert.equal(stripHtml("<style>x</style><p>A &amp; B<br>C</p>"), "A & B\nC");
  const pdf = fallbackPdf("<h1>Invoice OS-42</h1><p>Total 100</p>");
  assert.ok(pdf.subarray(0, 8).toString().startsWith("%PDF-1."));
  assert.ok(pdf.toString().endsWith("%%EOF"));
  assert.match(pdf.toString(), /Invoice OS-42/);
  assert.throws(() => assertPdf(Buffer.from("not-a-pdf")), (error) => error.code === "PDF_RENDERER_INVALID_OUTPUT");
});

test("ZIP Omie contém o PDF, tamanhos e CRC esperados", () => {
  const data = Buffer.from("%PDF-1.4\nconteudo\n%%EOF");
  const zip = zipSingleFile("invoice.pdf", data);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  const nameLength = zip.readUInt16LE(26);
  const compressedSize = zip.readUInt32LE(18);
  const compressed = zip.subarray(30 + nameLength, 30 + nameLength + compressedSize);
  assert.deepEqual(zlib.inflateRawSync(compressed), data);
  assert.equal(zip.readUInt32LE(14), crc32(data));
});

test("anexos repetidos são ignorados e limite falha antes do envio", async () => {
  const generatedBuffer = Buffer.from("invoice");
  const sameBuffer = Buffer.from("invoice");
  const extraBuffer = Buffer.from("contrato");
  const gateway = {
    listarAnexos: async () => ({ listaAnexos: [{ nIdAnexo: 1 }, { nIdAnexo: 2 }, { nIdAnexo: 3 }] }),
    obterAnexo: async (_base, _context, item) => ({ cNomeArquivo: item.nIdAnexo === 1 ? "invoice.pdf" : `anexo-${item.nIdAnexo}.txt`, cLinkDownload: `https://omie.example/${item.nIdAnexo}` }),
    downloadAttachment: async (url) => url.endsWith("/2") ? sameBuffer : extraBuffer,
  };
  const previous = process.env.EMAIL_MAX_TOTAL_BYTES;
  process.env.EMAIL_MAX_TOTAL_BYTES = "1024";
  try {
    const attachments = await collectOmieAttachments({
      base: {}, accessContext: {}, os: { Cabecalho: { nCodOS: 1 } },
      generated: { filename: "invoice.pdf", buffer: generatedBuffer, hash: sha256Buffer(generatedBuffer) },
      adapters: { gateway },
    });
    assert.deepEqual(attachments.map((item) => item.filename), ["anexo-3.txt"]);

    process.env.EMAIL_MAX_TOTAL_BYTES = "8";
    await assert.rejects(
      () => collectOmieAttachments({
        base: {}, accessContext: {}, os: { Cabecalho: { nCodOS: 1 } },
        generated: { filename: "invoice.pdf", buffer: generatedBuffer, hash: sha256Buffer(generatedBuffer) },
        adapters: { gateway },
      }),
      (error) => error.code === "EMAIL_ATTACHMENTS_TOO_LARGE",
    );
  } finally {
    if (previous === undefined) delete process.env.EMAIL_MAX_TOTAL_BYTES;
    else process.env.EMAIL_MAX_TOTAL_BYTES = previous;
  }
});

test("provedor não é chamado quando anexos excedem o limite", async () => {
  const previous = process.env.EMAIL_MAX_TOTAL_BYTES;
  process.env.EMAIL_MAX_TOTAL_BYTES = "3";
  let called = false;
  try {
    assert.equal(attachmentBytes([{ contentBase64: Buffer.from("abcd").toString("base64") }]), 4);
    await assert.rejects(
      () => sendEmail({
        from: { email: "from@example.com" }, to: ["to@example.com"], subject: "x", html: "x",
        attachments: [{ filename: "a", contentBase64: Buffer.from("abcd").toString("base64") }],
      }, { apiKey: "test", fetchImpl: async () => { called = true; } }),
      (error) => error.code === "EMAIL_ATTACHMENTS_TOO_LARGE",
    );
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.EMAIL_MAX_TOTAL_BYTES;
    else process.env.EMAIL_MAX_TOTAL_BYTES = previous;
  }
});
