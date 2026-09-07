# Contrato ponta a ponta de metadata, CRUD e UI

1. `central.domain.json` ou `defineModel` registra model, campos, CRUD, roles e metadata.
2. O backend expõe `/core/metadata`, `/core/models` e o router CRUD do `basePath`.
3. Escopo de tenant/usuário, validação, fórmulas, referência, auditoria e triggers são aplicados no servidor.
4. O objeto code-first do App compõe coleções, formulários, filtros, relações, esteiras, documentos e dashboards.
5. O frontend consulta metadata e monta componentes do Core.

O CRUD padrão inclui listagem paginada, leitura, criação, atualização parcial, exclusão e import/export quando habilitados. Use rota customizada somente quando a operação não puder ser representada por CRUD, ação declarativa ou processo.

Campos calculados são exibidos reativamente no frontend e recalculados no backend. Campos de escopo são internos e imutáveis. Referências devem usar os filtros declarados; não faça consultas sem escopo.
