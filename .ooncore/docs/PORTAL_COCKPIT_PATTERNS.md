# Portais e cockpits code-first

Portais e cockpits usam o mesmo contrato de frontend dos demais Apps. Defina o
App com `defineOonApp`, componha rotas com `defineOonRoutes` e inicialize com
`startOonApp`.

Use páginas locais para jornadas transversais e components do Core para
autenticação, autorização, tenant, shell, estados e acesso HTTP. O `appKind` não
cria uma exceção arquitetural nem restringe customização local.

Para jornadas multi-tenant, passe o tenant específico da operação ao cliente
HTTP. A seleção visual nunca substitui a autorização do backend.

Consulte `FRONTEND_CODE_FIRST.md`, `FRONTEND_API.md` e `RBAC_SECURITY.md`.

