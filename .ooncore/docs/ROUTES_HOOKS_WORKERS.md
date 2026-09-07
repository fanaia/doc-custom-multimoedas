# Rotas, hooks, triggers e workers

- `defineRoutes(basePath, router)`: registra rota específica do domínio. Proteja com auth já montada, `requirePermission`, validação e `req.accessContext`.
- `defineValidation(model, fn)`: valida o estado consolidado antes de persistir.
- `defineTrigger(model, fn)`: efeito de domínio rastreável associado à mutação.
- Process manifest: transições, bindings, invariantes, recálculos e jobs transacionais.
- Integration runtime: outbox/inbox, retry, lock, idempotência, histórico e webhook.

Não crie processo web paralelo, registry local, timer genérico ou worker que replique o Core. Jobs devem ser idempotentes, limitar retry, sanitizar payload/erro e encerrar com o lifecycle do processo.

No runtime local, workers e filas podem operar contra Mongo local, mas operações que exigem identidade da plataforma devem retornar `LOCAL_OPERATION_NOT_SUPPORTED`.
