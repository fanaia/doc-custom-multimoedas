"use strict";

const vm = require("node:vm");
const { GenericError } = require("@oondemand/oon-core-back");

const FORBIDDEN = /\b(?:process|require|module|exports|global|globalThis|Function|eval|WebAssembly|fetch|XMLHttpRequest)\b|(?:__proto__|prototype|constructor)/;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function compile(template) {
  const source = String(template || "");
  const token = /<%([=-]?)([\s\S]*?)%>/g;
  let cursor = 0;
  let match;
  const code = [];
  while ((match = token.exec(source))) {
    const text = source.slice(cursor, match.index);
    if (text) code.push(`__append(${JSON.stringify(text)});`);
    const mode = match[1];
    const body = match[2];
    if (FORBIDDEN.test(body)) {
      throw new GenericError("Template tentou acessar um recurso proibido.", {
        statusCode: 422,
        code: "TEMPLATE_FORBIDDEN_RESOURCE",
      });
    }
    if (mode === "=") code.push(`__append(__escape(( ${body} )));`);
    else if (mode === "-") code.push(`__append(( ${body} ));`);
    else code.push(body);
    cursor = token.lastIndex;
  }
  const tail = source.slice(cursor);
  if (tail) code.push(`__append(${JSON.stringify(tail)});`);
  return code.join("\n");
}

function renderTemplate(template, variables, options = {}) {
  const timeout = Math.max(50, Math.min(5000, Number(options.timeoutMs || process.env.TEMPLATE_RENDER_TIMEOUT_MS || 1500)));
  const maxBytes = Math.max(1024, Number(options.maxBytes || process.env.TEMPLATE_MAX_OUTPUT_BYTES || 5 * 1024 * 1024));
  let output = "";
  const sandbox = {
    __json: JSON.stringify(variables ?? {}),
    __escape: escapeHtml,
    __append(value) {
      output += String(value ?? "");
      if (Buffer.byteLength(output, "utf8") > maxBytes) {
        throw new GenericError("Saida do template excedeu o limite permitido.", {
          statusCode: 422,
          code: "TEMPLATE_OUTPUT_LIMIT",
        });
      }
    },
  };
  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
    name: "doc-custom-template",
  });
  const script = new vm.Script(
    `const __data = JSON.parse(__json); with (__data) { ${compile(template)} }`,
    { filename: "template.ejs" },
  );
  try {
    script.runInContext(context, { timeout, displayErrors: true, breakOnSigint: true });
    return output;
  } catch (error) {
    if (error?.code?.startsWith?.("TEMPLATE_")) throw error;
    throw new GenericError(`Falha ao renderizar template: ${String(error.message || error).slice(0, 500)}`, {
      statusCode: 422,
      code: error?.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "TEMPLATE_TIMEOUT" : "TEMPLATE_RENDER_ERROR",
    });
  }
}

module.exports = { compile, escapeHtml, renderTemplate };
