"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const app = JSON.parse(fs.readFileSync(path.join(__dirname, "../../central.app.json"), "utf8"));

test("preserva acesso de usuários ativados com o perfil developer", () => {
  const developer = app.rbac.roles.find((role) => role.code === "developer");

  assert.ok(developer, "o perfil developer não pode ser removido enquanto houver ativações legadas");
  assert.equal(developer.admin, true);
  assert.deepEqual(developer.permissions, ["*"]);
});

test("mantém os perfis de negócio junto ao perfil de compatibilidade", () => {
  const roleCodes = app.rbac.roles.map((role) => role.code);

  for (const expected of ["admin", "developer", "approver", "operator", "viewer"]) {
    assert.ok(roleCodes.includes(expected), `perfil obrigatório ausente: ${expected}`);
  }
});
