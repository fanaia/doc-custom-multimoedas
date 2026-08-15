"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { content } = require("../src/services/mandatoryTemplate");
const { renderTemplate } = require("../src/services/templateRenderer");

test("renderiza EJS com escape, saída crua e iteração", () => {
  const rendered = renderTemplate(
    "<% items.forEach((item) => { %><%= item %>|<%- item %>;<% }) %>",
    { items: ["<b>A</b>", "B"] },
  );
  assert.equal(rendered, "&lt;b&gt;A&lt;/b&gt;|<b>A</b>;B|B;");
});

test("bloqueia recursos de runtime e interrompe loops", () => {
  assert.throws(
    () => renderTemplate("<%= process.env %>", {}),
    (error) => error.code === "TEMPLATE_FORBIDDEN_RESOURCE",
  );
  assert.throws(
    () => renderTemplate("<% while (true) {} %>", {}, { timeoutMs: 50 }),
    (error) => error.code === "TEMPLATE_TIMEOUT",
  );
});

test("template obrigatório da issue renderiza com o contrato completo", () => {
  const html = renderTemplate(content(), {
    os: {
      Cabecalho: { nCodOS: 10, cNumOS: "OS-2026-42", nCodCli: 20, nValorTotal: 1300, dDtPrevisao: "30/08/2026" },
      InfoCadastro: { dDtInc: "14/08/2026" },
      InformacoesAdicionais: { dDataRps: "14/08/2026" },
      ServicosPrestados: [
        {
          cReembolso: "N", cDescServ: "Consultoria", nValUnit: 1000, nQtde: 1, nValorDesconto: 50,
          impostos: { cRetemCOFINS: "S", nValorCOFINS: 30, cRetemCSLL: "S", nValorCSLL: 10, cRetemIRRF: "N", nValorIRRF: 0, cRetemPIS: "S", nValorPIS: 20 },
        },
      ],
      despesasReembolsaveis: { despesaReembolsavel: [{ cDescReemb: "Passagem", nValorReemb: 300 }] },
      Observacoes: { cObsOS: "texto;[[Observação autorizada]]|" },
      Email: { cEnviarPara: "financeiro@cliente.example" },
    },
    cliente: {
      nome_fantasia: "Cliente Exemplo", cnpj_cpf: "12345678000190", codigo_pais: "1058",
      endereco: "Rua Um", endereco_numero: "10", bairro: "Centro", cidade: "São Paulo", pais: "Brasil",
    },
    baseOmie: { cnpj: "12345678000190", nome: "Base SP" },
    moedas: [
      { simbolo: "USD", valorFinal: 5.2, fonte: "bacen" },
      { simbolo: "EUR", valorFinal: 6.1, fonte: "historico" },
    ],
    configuracoes: [
      ["endereco-linha1", "Rua da Empresa, 1"], ["endereco-linha2", "São Paulo - SP"],
      ["cidade", "São Paulo"], ["razao-social", "Empresa Exemplo Ltda."],
      ["pagamento-banco", "Banco Exemplo"], ["pagamento-agencia", "0001"],
      ["pagamento-cc", "12345-6"], ["pagamento-swift", "EXAMPLE"], ["pagamento-iban", "BR0001"],
    ].map(([codigo, valor]) => ({ codigo, valor })),
    includes: [{ codigo: "logo", conteudo: "R0lGODlhAQABAIAAAAUEBA==", contentType: "image/gif" }],
  }, { timeoutMs: 1000 });

  assert.match(html, /FATURA \| INVOICE #OS-2026-42/);
  assert.match(html, /Consultoria/);
  assert.match(html, /Passagem/);
  assert.match(html, /Observação autorizada/);
  assert.match(html, /Banco Exemplo/);
  assert.match(html, /data:image\/gif;base64,R0lGOD/);
});

test("template obrigatório renderiza sem logo e respeita o MIME do arquivo", () => {
  const variables = {
    os: {
      Cabecalho: { nCodOS: 10, cNumOS: "OS-SEM-LOGO", nCodCli: 20, nValorTotal: 100, dDtPrevisao: "30/08/2026" },
      InfoCadastro: { dDtInc: "14/08/2026" }, InformacoesAdicionais: {},
      ServicosPrestados: [], despesasReembolsaveis: { despesaReembolsavel: [] },
      Observacoes: { cObsOS: "" }, Email: { cEnviarPara: "" },
    },
    cliente: { nome_fantasia: "Cliente", pais: "Brasil" }, baseOmie: { cnpj: "", nome: "Base" },
    moedas: [], configuracoes: [], includes: [],
  };
  const withoutLogo = renderTemplate(content(), variables);
  assert.match(withoutLogo, /FATURA \| INVOICE #OS-SEM-LOGO/);
  assert.doesNotMatch(withoutLogo, /<img src="data:/);

  const withPng = renderTemplate(content(), { ...variables, includes: [{ codigo: "logo", conteudo: "iVBORw0KGgo=", contentType: "image/png" }] });
  assert.match(withPng, /data:image\/png;base64,iVBORw0KGgo=/);
});

test("assunto e corpo de email legados acessam os dados Omie sem adaptacao", () => {
  const emailTemplate = `<%
let dataRps = os.InformacoesAdicionais.dDataRps ? os.InformacoesAdicionais.dDataRps.split("/") : [];
let competencia = "";
if(dataRps.length > 2) { competencia = \`\${dataRps[1]}/\${dataRps[2]}\`; }
%><%= cliente.razao_social %> - FATURAMENTO/ INVOICING EUROPARTNER <%= competencia %>`;
  const variables = {
    os: { InformacoesAdicionais: { dDataRps: "14/08/2026" } },
    cliente: { razao_social: "Cliente Legado Ltda." },
  };
  const rendered = renderTemplate(emailTemplate, variables);
  assert.equal(rendered, "Cliente Legado Ltda. - FATURAMENTO/ INVOICING EUROPARTNER 08/2026");
});
