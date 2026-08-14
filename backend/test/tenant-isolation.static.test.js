const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const pessoa = fs.readFileSync(path.join(root, "backend/src/models/Pessoa.js"), "utf8");
const backend = require(path.join(root, "backend/package.json"));
const app = require(path.join(root, "central.app.json"));

test("Pessoa usa escopo obrigatório por tenant no app multi-tenant", () => {
  assert.equal(app.tenancyModel, "multi_tenant");
  assert.equal(app.deploymentMode, "shared");
  assert.match(pessoa, /scope:\s*["']tenant["']/);
  assert.equal(backend.dependencies["@oondemand/oon-core-back"], "^0.4.5");
});

test("tenantId permanece interno e não é declarado como campo de formulário", () => {
  const schemaBlock = pessoa.split("schema:", 2)[1].split("crud:", 1)[0];
  assert.doesNotMatch(schemaBlock, /tenantId\s*:/);
});
