# Catálogo de capacidades do OonCore

Consulte este catálogo antes de criar infraestrutura ou componentes customizados. Para capabilities nativas, o guia dedicado é leitura obrigatória.

| Capacidade | Backend | Frontend | Declaração/extensão | Local | Plataforma |
|---|---|---|---|---|---|
| Models e CRUD | `defineModel`, domain manifest, `/core/*` | `CoreCollection`, hooks de API | `central.domain.json` ou composição code-first | Sim | Sim |
| Metadata | registry e `/core/metadata` | `useCoreMetadata`, renderers | models/domain manifest | Sim | Sim |
| Validações e fórmulas | `defineValidation`, domain rules | prévia reativa | domain manifest/validation | Sim | Sim |
| Esteiras | process manifest/runtime | `CorePipeline` | `central.process.json`, UI code-first | Sim | Sim |
| Documentos | `defineDocument` | `CoreDocument` | UI/domain manifest | Sim | Sim |
| Dashboards | agregações e rotas | `CoreDashboard` | UI code-first | Sim | Sim |
| RBAC | policy, middleware e `requirePermission` | `PermissionGate`, `can` | `central.app.json` | Simulação declarada | Identidade real |
| Tenant e escopo | access context e scope helpers | `TenantProvider` | `central.app.json` | Contexto técnico | Contexto autorizado |
| Auditoria | CRUD e request context | headers do SDK | automática/extensão | Local | Operacional |
| Rotas customizadas | `defineRoutes` | página/ação declarada | `backend/src/routes` | Sim | Sim |
| Jobs e workers | process workers | status operacional | manifestos/hooks | Sim | Sim |
| E-mail transacional | `capabilities.transactionalEmail` | `CoreTransactionalEmail` | [TRANSACTIONAL_EMAIL.md](TRANSACTIONAL_EMAIL.md) | Fail-closed/dublê de teste | Implementação resolvida pelo Core |
| PDF | `capabilities.pdf.render` | `useOonApi`/download | [PDF_RENDERING.md](PDF_RENDERING.md) | Fail-closed/dublê de teste | Implementação resolvida pelo runtime |
| Publicação/promoção | contratos de delivery | indisponível no App | CLI/ponte pública | Não | Sim |
| Runtime local | sessão e guardas locais | bootstrap/cookie/banner | `OON_RUNTIME_MODE=local` | Sim | Não aplicável |

Para cada capacidade, use o manifesto quando houver contrato declarativo e código da Central apenas nos pontos de extensão documentados. Se uma capability não possuir guia dedicado suficiente, registre uma lacuna; não descubra o contrato lendo fonte privada ou outro repositório.
