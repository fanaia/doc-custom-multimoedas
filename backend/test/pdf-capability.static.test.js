"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("declara e consome somente a capability nativa de PDF", () => {
  const deploy = JSON.parse(read("oon.deploy.json"));
  const renderer = read("backend/src/services/pdfRenderer.js");
  const workflow = read("backend/src/services/invoiceWorkflow.js");
  assert.deepEqual(deploy.capabilities.pdfRendering, { required: true, minVersion: "1.0.0" });
  assert.match(renderer, /capabilities\.pdf\.render/);
  assert.doesNotMatch(renderer + workflow, /PDF_RENDERER_URL|PDF_RENDERER_TOKEN|fallbackPdf|stripHtml/);
  assert.match(workflow, /htmlSnapshotPendente/);
  assert.match(workflow, /canReuseSnapshot/);
  assert.match(workflow, /\$unset: \{ htmlSnapshotPendente: 1 \}/);
});
