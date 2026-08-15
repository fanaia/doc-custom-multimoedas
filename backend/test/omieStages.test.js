"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStageUpdate, parseServiceStages } = require("../src/services/integrations/omieGateway");

test("interpreta cadastros retornados por ListarEtapasFaturamento", () => {
  const stages = parseServiceStages({
    cadastros: [
      { cCodOperacao: "02", cDescOperacao: "Venda de Produto", etapas: [{ cCodigo: "10", cDescricao: "Pedido" }] },
      {
        cCodOperacao: "01",
        cDescOperacao: "Venda de Serviço",
        etapas: [
          { cCodigo: "10", cDescricao: "Proposta", cInativo: "N" },
          { cCodigo: "50", cDescricao: "Faturar", cInativo: "N" },
          { cCodigo: "90", cDescricao: "Cancelada", cInativo: "S" },
        ],
      },
    ],
  });

  assert.deepEqual(stages, [
    { codigo: "10", descricao: "Proposta" },
    { codigo: "50", descricao: "Faturar" },
  ]);
});

test("mantem compatibilidade com retorno legado e descricao sem acento", () => {
  const stages = parseServiceStages({
    etapas: [{ cDescOperacao: "VENDA DE SERVICO", etapas: [{ cCodigo: "20", cDescrPadrao: "Em andamento" }] }],
  });

  assert.deepEqual(stages, [{ codigo: "20", descricao: "Em andamento" }]);
});

test("alteracao de etapa nao reenvia data de previsao historica para a Omie", () => {
  const payload = buildStageUpdate({
    Cabecalho: { nCodOS: 4951204645, dDtPrevisao: "19/10/2024", cCodParc: "999" },
    Observacoes: { cObsOS: "Observacao anterior" },
  }, "90", "Falha na geracao da invoice");

  assert.deepEqual(payload.Cabecalho, { nCodOS: 4951204645, cEtapa: "90" });
  assert.equal(payload.Observacoes.cObsOS, "Observacao anterior\nFalha na geracao da invoice");
  assert.equal("dDtPrevisao" in payload.Cabecalho, false);
  assert.equal("cCodParc" in payload.Cabecalho, false);
});
