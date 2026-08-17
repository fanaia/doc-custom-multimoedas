"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("upload de imagem deriva MIME e tamanho no servidor e oferece visualizacao", () => {
  const routes = read("src/routes/docCustom.js");
  const variables = read("src/services/invoiceVariables.js");
  const contracts = read("src/services/templateContracts.js");
  assert.match(routes, /imagens\/upload/);
  assert.match(routes, /Buffer\.byteLength\(conteudo, "base64"\)/);
  assert.match(routes, /imagens\/:id\/conteudo/);
  assert.match(variables, /find\(\{ tenantId, status: "ativo" \}\)\.select\("\+conteudo"\)\.lean\(\)/);
  assert.doesNotMatch(variables, /contenType: item\.contentType/);
  assert.doesNotMatch(variables, /caracteristicas: configuracoes/);
  assert.match(contracts, /contenType: item\.contenType \|\| item\.contentType/);
  assert.match(contracts, /caracteristicas: configuracoes/);
});

test("preview de template exige dados Omie do tenant", () => {
  const workflow = read("src/services/invoiceWorkflow.js");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(workflow, /previewTemplate/);
  assert.match(workflow, /tenantId: accessContext\.tenantId/);
  assert.match(workflow, /findScopedBase\(input\.baseOmieId/);
  assert.match(workflow, /numeroOs: input\.numeroOs \|\| input\.codigoOs/);
  assert.match(frontend, /\{ baseOmieId, numeroOs \}/);
  assert.match(frontend, /Migalhas de navegação/);
});

test("aprovacao nao sombreia o process global e preserva os dois identificadores da OS", () => {
  const workflow = read("src/services/invoiceWorkflow.js");
  const webhook = read("src/services/webhookService.js");
  assert.match(workflow, /process\.env\.PROCESS_LOCK_MS/);
  assert.match(workflow, /const lockedProcess = await Model\("ProcessoFatura"\)/);
  assert.doesNotMatch(workflow, /const process = await Model\("ProcessoFatura"\)\.findOneAndUpdate/);
  assert.doesNotMatch(workflow, /process\.env\.PDF_RENDERER_URL/);
  assert.match(workflow, /generateInvoice\(invoiceProcess, actor, adapters/);
  assert.doesNotMatch(workflow, /usesFallbackPdf|fallbackPdf/);
  assert.match(workflow, /htmlSnapshotPendente/);
  assert.match(workflow, /numeroOs: invoiceProcess\.numeroOs/);
  assert.match(webhook, /codigoOs: String\(codigoOs \|\| numeroOs \|\| ""\), numeroOs: String\(numeroOs \|\| ""\)/);
});

test("cadastro de etapas por base usa somente catalogo sincronizado do tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(routes, /validateMappingInput/);
  assert.match(routes, /tenantId, baseOmieId: base\._id, codigo: \{ \$in: stages \}, status: "ativo"/);
  assert.match(routes, /Esta base ja possui etapas cadastradas neste gatilho/);
  assert.match(frontend, /Cadastrar etapas da base/);
  assert.match(frontend, /item\.status==="ativo"&&String\(item\.baseOmieId/);
});

test("tickets de integracao Omie estao registrados", () => {
  const mapping = read("src/mappings/omie.js");
  const ui = read("../frontend/central.ui.json");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(mapping, /defineOmieMapping\("doc-custom-multimoedas"/);
  assert.match(frontend, /Tickets de Integração/);
});

test("SendGrid e webhook unico usam credenciais isoladas por tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const sender = read("src/services/emailSender.js");
  const credentials = read("src/services/sendgridCredentials.js");
  const webhook = read("src/services/baseCredentials.js");
  const webhookService = read("src/services/webhookService.js");
  const frontend = read("../frontend/src/main.tsx");
  assert.doesNotMatch(sender, /process\.env\.SENDGRID_API_KEY/);
  assert.match(credentials, /Config\(\)\.findOne\(\{ tenantId/);
  assert.match(credentials, /apiKeyEncrypted: encrypt\(apiKey\)/);
  assert.match(webhook, /\/api\/doc-custom\/webhooks\/omie\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(webhook, /!base\.webhookConfigurado && !base\.webhookTokenEncrypted/);
  assert.match(webhook, /WEBHOOK_STATE_INCONSISTENT/);
  assert.match(webhook, /WEBHOOK_NOT_CONFIGURED/);
  assert.doesNotMatch(webhook, /if \(!base\.webhookTokenEncrypted\) return rotateWebhook/);
  assert.match(read("src/services/webhookService.js"), /operacao: "webhook\.receive"/);
  assert.match(routes, /defineRoutes\("\/doc-custom"/);
  assert.match(routes, /defineRoutes\("\/api\/doc-custom"/);
  assert.match(routes, /router\.public\.post\("\/webhooks\/omie\/:token", handleOmieWebhook\)/);
  assert.match(frontend, /Tópico obrigatório no Omie/);
  assert.match(frontend, /Etapa da Ordem de Serviço alterada/);
  assert.match(frontend, /OrdemServico\.EtapaAlterada/);
  assert.match(webhookService, /message: "Tópico ignorado\."/);
  assert.match(webhookService, /integrationTickets\.success\(ticket, \{ resposta: response, codigoExterno: normalized\.eventId, mensagem: response\.message \}\)/);
  assert.match(frontend, /Não é necessário cadastrar inclusão, exclusão ou faturamento/);
});

test("bases sincronizam etapas categorias e contas correntes por tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const gateway = read("src/services/integrations/omieGateway.js");
  assert.match(routes, /categorias\/sincronizar/);
  assert.match(routes, /contas-correntes\/sincronizar/);
  assert.match(routes, /tenantId: accessContext\.tenantId/);
  assert.match(gateway, /data\?\.cadastros/);
});

test("templates imagens e configuracoes possuem manutencao operacional", () => {
  const routes = read("src/routes/docCustom.js");
  assert.match(routes, /private\.delete\("\/templates\/:id"/);
  assert.match(routes, /private\.put\("\/imagens\/:id"/);
  assert.match(routes, /private\.delete\("\/configuracoes\/:id"/);
});

test("listas Omie ficam fora do menu e moedas padrao sao criadas por tenant", () => {
  const routes = read("src/routes/docCustom.js");
  const ui = read("../frontend/central.ui.json");
  assert.match(routes, /DEFAULT_CURRENCIES/);
  assert.match(routes, /codigo: "USD"/);
  assert.match(routes, /codigo: "EUR"/);
  assert.match(routes, /codigo: "JPY"/);
  assert.match(routes, /filter: \{ tenantId, codigo: currency\.codigo \}/);
  assert.match(ui, /"model": "CategoriaOmie"[^\n]+"hidden": true/);
  assert.match(ui, /"model": "ContaCorrenteOmie"[^\n]+"hidden": true/);
});

test("PDF da fatura usa rota compatível com ingress e visualizador autenticado na aba", () => {
  const routes = read("src/routes/docCustom.js");
  const ui = read("../frontend/central.ui.json");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(routes, /async function handleProcessPdf/);
  assert.equal((routes.match(/private\.get\("\/processos\/:id\/pdf"/g) || []).length, 2);
  assert.match(routes, /cache-control", "private, no-store/);
  assert.match(ui, /"type": "customComponent", "component": "ProcessPdfViewer"/);
  assert.doesNotMatch(ui, /"id": "abrir-pdf"/);
  assert.match(frontend, /responseType: "blob"/);
  assert.match(frontend, /ProcessPdfViewer/);
  assert.match(frontend, /Reduzir zoom/);
  assert.match(frontend, /Aumentar zoom/);
});


test("modal da esteira prioriza a decisão e confirma destinatários antes do envio", () => {
  const routes = read("src/routes/docCustom.js");
  const workflow = read("src/services/invoiceWorkflow.js");
  const model = read("src/models/ProcessoFatura.js");
  const ui = read("../frontend/central.ui.json");
  const frontend = read("../frontend/src/main.tsx");
  assert.match(model, /destinatariosEnvio/);
  assert.match(routes, /processos\/:id\/envio\/destinatarios/);
  assert.match(routes, /supplierName/);
  assert.match(routes, /ServicosPrestados/);
  assert.match(workflow, /configuredRecipients\.configured/);
  assert.match(ui, /"defaultTab": "decisao"/);
  assert.match(ui, /"component": "InvoiceDecisionPanel"/);
  assert.doesNotMatch(ui, /"id": "enviar"/);
  assert.match(frontend, /Quem receberá a fatura/);
  assert.match(frontend, /Confirmar e enviar fatura/);
  assert.match(frontend, /Serviços faturados/);
});


test("abertura da decisão não consome a API de anexos do Omie", () => {
  const routes = read("src/routes/docCustom.js");
  const frontend = read("../frontend/src/main.tsx");
  const start = routes.indexOf('router.private.get("/processos/:id/envio"');
  const end = routes.indexOf('router.private.put("/processos/:id/envio/destinatarios"', start);
  const decisionRoute = routes.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(decisionRoute, /listarAnexos/);
  assert.match(decisionRoute, /anexosEnviados/);
  assert.match(decisionRoute, /attachmentsDeferred/);
  assert.match(frontend, /somente ao confirmar o envio, evitando consumo redundante/);
});
