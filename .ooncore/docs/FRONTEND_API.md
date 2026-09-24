# API pública do `@oondemand/oon-core-front`

O contrato principal do frontend é code-first.

## Bootstrap

- `defineOonApp`: define identidade, API, rotas, navegação, shell, layouts, páginas, componentes e temas.
- `startOonApp`: valida e monta o App React.
- `defineOonRoutes`, `defineOonNavigation`: helpers tipados para composição local.

## Subpaths públicos

- `/ui`: primitives, padrões e componentes de domínio;
- `/routing`: rotas, navegação e helpers;
- `/theme`: temas, tokens e seleção em runtime;
- `/hooks`: hooks de autenticação, tenant, API e metadata;
- `/testing`: utilitários de teste.

## Segurança

- `useOonAuth`, `can`, `PermissionGate`, `Can`: permissões resolvidas pelo backend;
- `useOonTenant`, `createTenantStorage`: contexto tenant quando aplicável;
- `useOonApi`, `useOonResource`, `useCoreMetadata`, `useModelSchema`: acesso padronizado;
- rotas reservadas e guards obrigatórios pertencem ao Core.

## Domínio e UI

Views declarativas continuam disponíveis como composição opcional dentro do
objeto App. Componentes, páginas e layouts locais podem ser usados em qualquer
`appKind`. Consulte `FRONTEND_CODE_FIRST.md`.

