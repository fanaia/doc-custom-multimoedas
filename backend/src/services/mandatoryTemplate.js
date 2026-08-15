"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { registry } = require("@oondemand/oon-core-back");

const TEMPLATE_CODE = "invoice-os-obrigatorio";
const TEMPLATE_VERSION = 1;

function content() {
  return fs.readFileSync(path.join(__dirname, "../templates/invoice-os-v1.html"), "utf8");
}

async function importMandatoryTemplate(accessContext) {
  const Template = registry.getModel("Template").mongooseModel;
  const filter = {
    tenantId: accessContext.tenantId,
    codigo: TEMPLATE_CODE,
    tipo: "documento",
    versao: TEMPLATE_VERSION,
  };
  const existing = await Template.findOne(filter);
  if (existing) return { created: false, template: existing };
  try {
    const template = await Template.create({
      ...filter,
      descricao: "Fatura de OS multimoedas obrigatoria da issue #2",
      contratoVariaveis: "native-v2",
      conteudo: content(),
      status: "ativo",
    });
    return { created: true, template };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return { created: false, template: await Template.findOne(filter) };
  }
}

module.exports = { TEMPLATE_CODE, TEMPLATE_VERSION, content, importMandatoryTemplate };
