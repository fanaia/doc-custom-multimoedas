"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { renderTemplate } = require("../src/services/templateRenderer");
const { contractVersion, variablesForTemplate } = require("../src/services/templateContracts");

const canonical = {
  os: { Cabecalho: { cNumOS: "71" } },
  cliente: { razao_social: "Cliente" },
  baseOmie: { codigo: "dev" },
  moedas: [{ codigo: "USD", simbolo: "USD", simboloMonetario: "$", tipoCotacao: "cotacao", cotacao: 5.2, valorFinal: "5.2000", status: "ativo" }],
  configuracoes: [{ codigo: "limite", valor: "10", valorTipado: 10, status: "ativo" }],
  includes: [],
};

test("templates existentes usam legacy-v1 e recebem include vazio quando a imagem nao existe", () => {
  const template = {
    conteudo: "<%= includes.find(item => item.codigo === 'logo').conteudo %>",
  };
  const variables = variablesForTemplate(template, canonical);
  assert.equal(contractVersion(template), "legacy-v1");
  assert.equal(variables.moedas[0].simbolo, "USD");
  assert.equal(variables.configuracoes[0].valor, "10");
  assert.equal(variables.includes[0].codigo, "logo");
  assert.equal(variables.includes[0].ausente, true);
  assert.equal(renderTemplate(template.conteudo, variables), "");
});

test("native-v2 entrega tipos nativos sem aliases de compatibilidade", () => {
  const template = { contratoVariaveis: "native-v2", conteudo: "<%= moedas[0].codigo %>" };
  const variables = variablesForTemplate(template, canonical);
  assert.equal(variables.moedas[0].codigo, "USD");
  assert.equal(variables.moedas[0].simbolo, "$");
  assert.equal(variables.moedas[0].valorFinal, 5.2);
  assert.equal(variables.configuracoes[0].valor, 10);
  assert.equal("caracteristicas" in variables, false);
});
