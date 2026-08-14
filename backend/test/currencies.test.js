"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ptaxDate, resolveRate } = require("../src/services/currencies");

test("moeda fixa exige e retorna valor positivo", async () => {
  const rate = await resolveRate({ codigo: "BRL", fonte: "fixa", valorFixo: 1.25 }, { now: "2026-08-14T12:00:00Z" });
  assert.deepEqual({ value: rate.value, source: rate.source }, { value: 1.25, source: "fixa" });
  await assert.rejects(() => resolveRate({ codigo: "BRL", fonte: "fixa", valorFixo: 0 }), /sem valor fixo valido/);
});

test("Bacen tem precedência sobre histórico e contingência", async () => {
  const rate = await resolveRate(
    { codigo: "USD", fonte: "bacen", ultimoValorValido: 4.8, valorContingencia: 4.5 },
    { now: "2026-08-14T12:00:00Z", fetchPtax: async () => ({ value: 5.41, referenceDate: "2026-08-13T13:00:00Z" }) },
  );
  assert.equal(rate.value, 5.41);
  assert.equal(rate.source, "bacen");
  assert.equal(rate.warning, "");
});

test("indisponibilidade do Bacen usa histórico persistido", async () => {
  const rate = await resolveRate(
    { codigo: "EUR", fonte: "bacen", valorContingencia: 5.9 },
    {
      now: "2026-08-14T12:00:00Z",
      fetchPtax: async () => { throw new Error("offline"); },
      loadHistory: async () => ({ valor: 6.12, referenciaEm: "2026-08-12T13:00:00Z" }),
    },
  );
  assert.equal(rate.value, 6.12);
  assert.equal(rate.source, "historico");
  assert.match(rate.warning, /ultima cotacao valida/);
  assert.equal(rate.referenceDate.toISOString(), "2026-08-12T13:00:00.000Z");
});

test("sem histórico usa contingência e nunca aceita zero implícito", async () => {
  const adapters = { fetchPtax: async () => { throw new Error("offline"); }, loadHistory: async () => null };
  const rate = await resolveRate({ codigo: "USD", fonte: "bacen", valorContingencia: 5.03 }, adapters);
  assert.equal(rate.value, 5.03);
  assert.equal(rate.source, "contingencia");
  await assert.rejects(
    () => resolveRate({ codigo: "USD", fonte: "bacen", valorContingencia: 0, ultimoValorValido: 0 }, adapters),
    (error) => error.code === "CURRENCY_RATE_UNAVAILABLE",
  );
});

test("formata a data PTAX no contrato mm-dd-aaaa", () => {
  assert.equal(ptaxDate(new Date("2026-08-04T12:00:00Z")), "08-04-2026");
});
