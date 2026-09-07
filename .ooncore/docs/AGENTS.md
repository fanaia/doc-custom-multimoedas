# OonCore — entrada canônica para IA/Agents

Este arquivo é o contrato inicial neutro para Codex, ChatGPT, Kimi, Manus e outros Agents que criem ou alterem uma Central Oon.

## Contrato de autonomia

O Agent deve trabalhar em modo **closed-book**: a árvore do App gerado, incluindo `.ooncore/`, é suficiente. Código-fonte do OonCore, `node_modules`, repositórios de outros Apps e documentação privada não são contratos de extensão e não devem ser usados para descobrir comportamento suportado.

Se a documentação distribuída não responder à tarefa, pare e registre a lacuna. Não invente API nem contorne a fronteira pública.

## Ordem de leitura

1. Leia primeiro o `AGENTS.md` da raiz do projeto consumidor, quando existir.
2. Confirme `schemaVersion`, `version`, `docsHash` e `entrypointsHash` em `.ooncore/manifest.json`.
3. Rode `npm run ooncore:docs:check`; se falhar, rode `npm run ooncore:docs` e verifique novamente.
4. Leia [OON_APP_AGENT_GUIDE.md](OON_APP_AGENT_GUIDE.md).
5. Consulte [CAPABILITIES.md](CAPABILITIES.md) antes de criar código.
6. Leia os contratos de backend, frontend, runtime, RBAC ou capability indicados abaixo.
7. Leia a documentação de domínio do projeto consumidor.

O `AGENTS.md` da raiz pertence ao projeto e nunca pode ser sobrescrito pelo scaffold ou pelo sync do Core.

## Roteamento por tarefa

| Tarefa | Leitura obrigatória |
|---|---|
| Criar um App ou definir onde customizar | [OON_APP_AGENT_GUIDE.md](OON_APP_AGENT_GUIDE.md), [CAPABILITIES.md](CAPABILITIES.md) |
| Domínio, models, validações e fórmulas | [BACKEND_API.md](BACKEND_API.md), [BACKEND_DOMAIN_MANIFEST.md](BACKEND_DOMAIN_MANIFEST.md), [BACKEND_PATTERNS.md](BACKEND_PATTERNS.md), [REACTIVE_DOMAIN_FORMULAS.md](REACTIVE_DOMAIN_FORMULAS.md) |
| CRUD, metadata e UI | [METADATA_CRUD_UI.md](METADATA_CRUD_UI.md), [FRONTEND_API.md](FRONTEND_API.md), [FRONTEND_CODE_FIRST.md](FRONTEND_CODE_FIRST.md) |
| Auth, ativação, tenant ou permissões | [AUTH_ACTIVATION_RBAC.md](AUTH_ACTIVATION_RBAC.md), [RBAC_SECURITY.md](RBAC_SECURITY.md), [DO_AND_DONT.md](DO_AND_DONT.md) |
| Renderizar, visualizar ou baixar PDF | [PDF_RENDERING.md](PDF_RENDERING.md), [BACKEND_API.md](BACKEND_API.md), [FRONTEND_API.md](FRONTEND_API.md) |
| Configurar templates ou enviar e-mail | [TRANSACTIONAL_EMAIL.md](TRANSACTIONAL_EMAIL.md), [RBAC_SECURITY.md](RBAC_SECURITY.md) |
| Execução local | [RUNTIME_MODES.md](RUNTIME_MODES.md), [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md), [LOCAL_SECURITY_BOUNDARY.md](LOCAL_SECURITY_BOUNDARY.md) |
| Rotas, hooks, jobs e filas | [ROUTES_HOOKS_WORKERS.md](ROUTES_HOOKS_WORKERS.md), [BACKEND_PATTERNS.md](BACKEND_PATTERNS.md) |
| Upgrade do Core | [CORE_UPGRADE.md](CORE_UPGRADE.md), [TESTING_CONFORMANCE.md](TESTING_CONFORMANCE.md), [releases/0.6.0.md](releases/0.6.0.md) |
| UX avançada | [ADVANCED_UX_PATTERNS.md](ADVANCED_UX_PATTERNS.md), [DETAIL_MODAL_AND_RELATED_GRIDS.md](DETAIL_MODAL_AND_RELATED_GRIDS.md), [PORTAL_COCKPIT_PATTERNS.md](PORTAL_COCKPIT_PATTERNS.md) |

## Fronteira obrigatória

- O App declara domínio e experiência em código; o Core fornece bootstrap, autenticação, ativação, RBAC, tenant, CRUD, metadata, shell, componentes genéricos e deployment.
- Use somente exports públicos documentados. Arquivos internos de `src/` não são contrato de extensão.
- Autorização, tenant e regras que alteram dados são sempre validados no backend.
- Não crie autenticação, ativação, RBAC, CRUD, shell, registry ou infraestrutura paralelos.
- Não coloque segredos em manifesto, frontend, log, URL permanente ou documentação.
- Recursos de plataforma devem falhar fechado no runtime local.

## Gates antes de concluir

```bash
npm run ooncore:docs:check
npm run ooncore:conformance
npm run check
npm test
```

Uma entrega que depende da leitura de fonte privada ou de outro App não está concluída: registre a lacuna na documentação distribuída.
