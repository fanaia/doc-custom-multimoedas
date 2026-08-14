"use strict";

const { defineTenantModel, fields, secretField } = require("./_shared");

const ETAPAS = [
  "Aprovar processamento",
  "Gerar fatura",
  "Aprovar fatura",
  "Anexar no Omie",
  "Enviar e-mail",
  "Atualizar status Omie",
  "Concluido",
  "Falha",
  "Rejeitado",
];

defineTenantModel({
  name: "ProcessoFatura",
  singular: "processo-fatura",
  basePath: "/processos-faturas",
  schema: {
    baseOmieId: fields.ref("BaseOmie", { required: true, label: "Base Omie" }),
    gatilhoId: fields.ref("Gatilho", { required: true, label: "Gatilho" }),
    gatilhoBaseId: fields.ref("GatilhoBase", { required: true, label: "Mapeamento" }),
    processoAnteriorId: fields.ref("ProcessoFatura", { label: "Execucao anterior" }),
    idempotencyKey: secretField(),
    eventoExternoId: fields.string({ required: true, label: "Evento externo" }),
    codigoOs: fields.string({ required: true, label: "Codigo OS", searchable: true }),
    numeroOs: fields.string({ label: "Numero OS", searchable: true }),
    clienteNome: fields.string({ label: "Cliente", searchable: true }),
    etapa: fields.enum(ETAPAS, { required: true, label: "Etapa", default: "Aprovar processamento" }),
    status: fields.enum(["ativo", "concluido", "falha", "rejeitado"], {
      required: true,
      label: "Status",
      default: "ativo",
    }),
    falhaNaEtapa: fields.string({ label: "Falha na etapa" }),
    alerta: fields.string({ label: "Alerta" }),
    aprovadoProcessamentoEm: fields.date({ label: "Processamento aprovado em" }),
    aprovadoProcessamentoPor: fields.string({ label: "Processamento aprovado por" }),
    aprovadoFaturaEm: fields.date({ label: "Fatura aprovada em" }),
    aprovadoFaturaPor: fields.string({ label: "Fatura aprovada por" }),
    rejeitadoEm: fields.date({ label: "Rejeitado em" }),
    rejeitadoPor: fields.string({ label: "Rejeitado por" }),
    motivoRejeicao: fields.string({ label: "Motivo da rejeicao" }),
    artefatoPdfId: fields.ref("ArtefatoPdf", { label: "PDF" }),
    pdfHash: fields.string({ label: "Hash PDF" }),
    omieAnexoId: fields.string({ label: "Anexo Omie" }),
    emailProviderId: fields.string({ label: "ID do e-mail" }),
    emailEnviadoEm: fields.date({ label: "E-mail enviado em" }),
    statusOmieAtualizadoEm: fields.date({ label: "Status Omie atualizado em" }),
    destinatarios: { type: [String], default: [] },
    anexosEnviados: { type: [Object], default: [] },
    cotacoesUsadas: { type: [Object], default: [] },
    templateSnapshot: { type: Object, default: {} },
    variaveisSnapshot: { type: Object, default: {} },
    emailSnapshot: { type: Object, default: {} },
    tentativas: fields.number({ label: "Tentativas", default: 0 }),
    ultimoErro: { type: Object, default: {} },
    iniciadoEm: fields.date({ required: true, label: "Inicio", default: Date.now }),
    concluidoEm: fields.date({ label: "Conclusao" }),
    lockToken: secretField(),
    lockUntil: fields.date({ label: "Bloqueado ate" }),
  },
  crud: {
    enabled: true,
    populateRefs: ["baseOmieId", "gatilhoId", "gatilhoBaseId", "processoAnteriorId", "artefatoPdfId"],
    permissions: { read: "process.read", write: "process.system" },
  },
}, [
  [{ idempotencyKey: 1 }, { unique: true }],
  [{ tenantId: 1, processoAnteriorId: 1 }, { unique: true, sparse: true }],
  [{ tenantId: 1, baseOmieId: 1, codigoOs: 1, createdAt: -1 }, {}],
  [{ tenantId: 1, etapa: 1, status: 1 }, {}],
]);

module.exports = { ETAPAS };
