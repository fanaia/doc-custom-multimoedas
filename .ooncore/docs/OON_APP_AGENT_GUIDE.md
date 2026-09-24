# Criar e customizar um Oon App com um Agent

Este é o roteiro canônico de autoria. O contrato de aceite é **closed-book**: o Agent recebe somente a árvore do App gerado, incluindo `.ooncore/`, e não precisa consultar o código-fonte do OonCore, repositórios de outros Apps ou documentação privada.

## 1. Gerar a base

Em um diretório vazio:

```bash
npx --yes --package @oondemand/create-central-oon@0.6 create-central-oon meu-app --no-install
cd meu-app
npm install
npm run ooncore:docs:check
```

O gerador cria backend, frontend, manifestos, gates e a documentação versionada em `.ooncore/`. Não copie arquivos de outro App para iniciar uma Central.

## 2. Ler antes de alterar

1. Leia `.ooncore/AGENTS.md`.
2. Confira `.ooncore/manifest.json` e rode `npm run ooncore:docs:check`.
3. Consulte [CAPABILITIES.md](CAPABILITIES.md).
4. Abra somente os contratos indicados para a tarefa.
5. Leia o `AGENTS.md` da raiz, quando o projeto possuir regras próprias.

Se a resposta não estiver nesses arquivos, pare e registre uma lacuna documental. Não deduza contrato lendo `node_modules`, `src/` privado ou outros repositórios.

## 3. Separar os contratos

| Necessidade | Local correto |
|---|---|
| Identidade, tipo do App, tenant, acesso, módulos e RBAC | `central.app.json` |
| Recursos exigidos do ambiente de publicação | `oon.deploy.json` |
| Models e regras de domínio | `backend/src` ou `backend/central.domain.json`, quando o contrato declarativo for adotado |
| Rotas e serviços específicos | `backend/src/routes` e `backend/src/services` |
| Rotas, navegação, páginas, tema e experiência | `frontend/src/app`, `frontend/src/pages` e `frontend/src/components` |
| Auth, ativação, shell, CRUD, metadata e infraestrutura | OonCore; não reimplementar |

`central.app.json` e `oon.deploy.json` têm finalidades diferentes. Uma capability funcional do App pode exigir declaração no primeiro; uma dependência de infraestrutura, como renderização de PDF, é declarada no segundo. Siga o guia da capability.

## 4. Customizar

- Domínio: use [BACKEND_API.md](BACKEND_API.md), [BACKEND_DOMAIN_MANIFEST.md](BACKEND_DOMAIN_MANIFEST.md) e [BACKEND_PATTERNS.md](BACKEND_PATTERNS.md).
- Frontend: use [FRONTEND_CODE_FIRST.md](FRONTEND_CODE_FIRST.md), [FRONTEND_API.md](FRONTEND_API.md) e os padrões de UI indicados no catálogo.
- Segurança: declare permissões em `central.app.json`, aplique `requirePermission` no backend e use guards públicos no frontend.
- Capabilities: abra o contrato dedicado antes de declarar ou consumir.
- Runtime local: preserve o comportamento fail-closed descrito em [LOCAL_SECURITY_BOUNDARY.md](LOCAL_SECURITY_BOUNDARY.md).

Crie apenas código de negócio. URLs internas, credenciais, registries, transports e detalhes de implementação não pertencem ao App.

## 5. Validar

```bash
npm run ooncore:docs:check
npm run ooncore:conformance
npm run check
npm test
```

Além dos gates, prove o fluxo de usuário da tarefa. Para respostas binárias, valide tipo, assinatura e download; para mutações, valide permissão, tenant, idempotência e erros.

## Critério final do Agent

O relato de entrega deve informar:

- contratos públicos consultados;
- manifestos e pontos de extensão alterados;
- testes e gates executados;
- limitações do runtime local;
- qualquer lacuna documental encontrada.

Citar fonte privada como requisito de implementação significa que a tarefa ainda não atende a este contrato.
