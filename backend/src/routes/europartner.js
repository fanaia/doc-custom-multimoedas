"use strict";
const { defineRoutes } = require("@oondemand/oon-core-back");
const { migrate } = require("../services/europartnerSettings");
defineRoutes("/europartner", router => {
  router.private.post("/settings/migration", { permission: "settings.manage", audit: { entidade: "EuropartnerSettings", acao: "migracao" } }, async (req, res) => {
    res.json(await migrate(req.accessContext, { apply: req.body?.apply === true }));
  });
});
