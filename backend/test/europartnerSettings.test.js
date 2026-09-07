"use strict";
const test = require("node:test"); const assert = require("node:assert/strict");
const { migrationRecords, resolveRecords, validateSettings } = require("../src/services/europartnerSettings");
const { registry } = require("@oondemand/oon-core-back");
test("migration preserves global/base precedence and explicit false/list overrides", () => {
  const rows = [
    { codigo: "razao-social", valor: "Empresa sintética", status: "ativo" },
    { codigo: "razao-social", valor: "Filial sintética", baseOmieId: "base-a", status: "ativo" },
    { codigo: "automacao-envio-automatico", valor: "true", tipo: "booleano", status: "ativo" },
    { codigo: "automacao-envio-automatico", valor: "false", tipo: "booleano", baseOmieId: "base-a", status: "ativo" },
    { codigo: "email-cc", valor: "a@example.test;b@example.test", status: "ativo" },
    { codigo: "custom-unmapped", valor: "retained", status: "ativo" },
  ];
  const migrated = migrationRecords("tenant-a", rows);
  assert.deepEqual(migrated.unmapped, ["custom-unmapped"]);
  const resolved = resolveRecords(migrated.records, "base-a");
  assert.equal(resolved.find(x => x.codigo === "razao-social").valor, "Filial sintética");
  assert.equal(resolved.find(x => x.codigo === "automacao-envio-automatico").valorTipado, false);
  assert.deepEqual(resolved.find(x => x.codigo === "email-cc").valorTipado, ["a@example.test", "b@example.test"]);
  assert.deepEqual(migrationRecords("tenant-a", rows), migrated);
});
test("dry-run is read-only; repeated migration retains source and reports conflicting edits", async () => {
  const source = [{ codigo: "razao-social", valor: "Empresa sintética", status: "ativo" }];
  const target = new Map(); let writes = 0;
  const query = value => ({ lean: async () => value });
  const original = registry.getModel;
  const models = { Configuracao: { find: () => query(source) }, EuropartnerSettings: {
    findOne: ({ baseOmieId }) => query(target.get(String(baseOmieId))),
    updateOne: async ({ baseOmieId }, update) => { writes++; if (!target.has(String(baseOmieId))) target.set(String(baseOmieId), structuredClone(update.$setOnInsert)); },
  } };
  registry.getModel = name => ({ mongooseModel: models[name] });
  try {
    const { migrate } = require("../src/services/europartnerSettings");
    const dry = await migrate({ tenantId: "tenant-a" }); assert.equal(dry.applied, false); assert.equal(writes, 0);
    await migrate({ tenantId: "tenant-a" }, { apply: true });
    const snapshot = structuredClone([...target.values()]);
    await migrate({ tenantId: "tenant-a" }, { apply: true });
    assert.deepEqual([...target.values()], snapshot); assert.equal(source[0].valor, "Empresa sintética");
    target.get("null").razaoSocial = "Edição aprovada";
    assert.deepEqual((await migrate({ tenantId: "tenant-a" })).conflicts, ["global"]);
    const before = writes;
    await assert.rejects(migrate({ tenantId: "tenant-a" }, { apply: true }), { code: "EUROPARTNER_MIGRATION_CONFLICT" });
    assert.equal(writes, before); assert.equal(target.get("null").razaoSocial, "Edição aprovada");
  } finally { registry.getModel = original; }
});
test("a typed global value cannot hide an unmigrated base override", async () => {
  const query = value => ({ lean: async () => value });
  const original = registry.getModel;
  registry.getModel = name => ({ mongooseModel: { find: () => query(name === "Configuracao" ? [
    { codigo: "razao-social", valor: "Filial legada", baseOmieId: "base-a", status: "ativo" },
  ] : [{ razaoSocial: "Padrão tipado", baseOmieId: null, status: "ativo" }]) } });
  try {
    await assert.rejects(require("../src/services/configuration").resolvedConfigurations("tenant-a", "base-a"), { code: "EUROPARTNER_SETTINGS_MIGRATION_REQUIRED" });
  } finally { registry.getModel = original; }
});
test("backend rejects malformed booleans, emails and issuer data", () => {
  for (const data of [{ envioAutomatico: "false" }, { emailCc: "a@example.test" }, { emailCc: ["invalid"] }, { razaoSocial: { nested: true } }]) {
    assert.throws(() => validateSettings(data), { code: "EUROPARTNER_SETTINGS_INVALID" });
  }
  assert.throws(() => migrationRecords("tenant-a", [{ codigo: "automacao-envio-automatico", valor: "sim", status: "ativo" }]), { code: "EUROPARTNER_SETTINGS_INVALID" });
});
