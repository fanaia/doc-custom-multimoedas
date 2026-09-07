# OonCore — Contexto consolidado para IA/Agents

> Arquivo gerado automaticamente por `create-central-oon docs sync`.
> Não edite manualmente. A fonte de verdade está no pacote `@oondemand/create-central-oon` instalado.

Este contexto consolida os contratos públicos para Codex, ChatGPT, Kimi, Manus ou qualquer Agent compatível.

---

<!-- source: ADVANCED_UX_PATTERNS.md -->

# ADVANCED_UX_PATTERNS.md — UX Avançada Declarativa no OonCore

Este documento orienta Agents a usarem os componentes públicos do OonCore e a
composição code-first antes de recriar padrões operacionais.

## Objetivo

Permitir que uma Central declare experiências avançadas como:

```txt
Entidade principal
├── grid principal com filtros e ações
└── modal de detalhe com abas
    ├── resumo
    ├── dados principais
    ├── itens relacionados editáveis inline
    └── registros relacionados somente leitura
```

Caso de referência: `OrcamentoProjeto -> OrcamentoItem -> Pagamento`.

## Regra de ouro para IAs

Antes de criar uma página React customizada, verifique se a necessidade pode ser resolvida por:

1. Views `collection` em `defineOonApp({ ui })`.
2. `list.filters` e `list.rowActions`.
3. `detailModal.tabs`.
4. `form.groups`.
5. `relatedGrid`.
6. `rowActions` declarativas.
7. Um pequeno `customComponent` isolado.

Código customizado de página inteira deve ser a última opção.

## Padrão 1 — Tela principal limpa

A tela principal de uma coleção operacional deve conter apenas:

- título e descrição;
- filtros;
- busca;
- botão novo;
- grid principal;
- ações por linha.

Ela **não deve** expandir detalhes complexos abaixo do grid. Relações, edição profunda e acompanhamento devem ir para a modal de detalhe.

## Padrão 2 — Modal de detalhe com abas

Use uma modal quando o usuário precisar operar um registro com várias perspectivas.

Abas recomendadas:

- `summary`: visão rápida de indicadores e contadores.
- `form`: dados principais do registro.
- `relatedGrid`: filhos editáveis, como itens do orçamento.
- `readonlyGrid`: registros relacionados apenas para consulta, como pagamentos gerados.

## Padrão 3 — Formulários agrupados

Formulários longos devem ser divididos em grupos semânticos:

```json
{
  "type": "form",
  "groups": [
    { "label": "Identificação", "fields": ["codigo", "nome", "status"] },
    { "label": "Faturamento", "fields": ["cliente", "cnpj", "contato"] },
    { "label": "Observações", "fields": ["observacoes"] }
  ]
}
```

## Padrão 4 — Itens relacionados editáveis inline

Quando uma entidade principal tem muitos itens filhos, como itens de orçamento, serviços, parcelas, documentos ou pedidos, prefira `relatedGrid` com `editMode: "inline"`.

Comportamento esperado:

- edição célula a célula;
- indicação de linha alterada;
- botão `Salvar` por linha;
- botão `Cancelar` por linha;
- validação antes de salvar;
- loading por linha;
- erro por linha;
- atualização automática dos dados relacionados.

## Padrão 5 — Ações por linha

Ações de domínio devem ser declaradas no manifesto e executadas por HTTP.

Exemplo:

```json
{
  "id": "gerarPagamento",
  "label": "Gerar pagamento",
  "type": "apiAction",
  "method": "POST",
  "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
  "disabledWhen": { "field": "pagamentoId", "exists": true },
  "refresh": ["self", "pagamentos", "resumo"]
}
```

A regra de negócio continua na Central ou no backend. O Core apenas renderiza, valida permissões, executa a ação e atualiza a interface.

## Padrão 6 — Relações declarativas

Sempre que possível, declare relações no manifesto:

```json
{
  "relations": {
    "itens": {
      "model": "OrcamentoItem",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    },
    "pagamentos": {
      "model": "Pagamento",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    }
  }
}
```

Assim, qualquer aba pode referenciar `relation: "itens"` sem repetir configuração.

## Padrão 7 — Abas somente leitura

Use `readonlyGrid` para dados relacionados que não devem ser editados naquela tela.

Exemplo: pagamentos gerados a partir dos itens de um orçamento.

## Padrão 8 — Refresh entre abas

Ações em uma aba podem afetar outras abas. O manifesto deve declarar o refresh esperado:

```json
"refresh": ["self", "pagamentos", "resumo"]
```

Significado:

- `self`: recarrega o grid atual;
- `pagamentos`: recarrega a aba pagamentos;
- `resumo`: recalcula cards da aba resumo;
- `parent`: recarrega o registro principal.

## Quando ainda usar componente customizado

Use componente customizado apenas quando:

- houver visualização muito específica de negócio;
- o padrão ainda não existir no Core;
- a regra envolver interação visual não generalizável;
- o componente puder ser isolado e reaproveitado.

Mesmo nesses casos, prefira plugar o componente em uma aba `customComponent` da modal, e não substituir a página inteira.

## Checklist para Agents

Antes de criar tela customizada:

- [ ] A coleção principal pode usar `collections[]`?
- [ ] Os filtros cabem em `list.filters`?
- [ ] As ações de linha cabem em `list.rowActions`?
- [ ] O detalhe cabe em `detailModal`?
- [ ] Os campos cabem em `form.groups`?
- [ ] Os filhos cabem em `relatedGrid`?
- [ ] As ações dos filhos cabem em `rowActions`?
- [ ] A consulta relacionada cabe em `readonlyGrid`?
- [ ] O refresh entre abas está declarado?
- [ ] RBAC está no backend e refletido no manifesto?

## Antipadrões

Evite:

- recriar shell, menu, roteamento e providers;
- codificar página inteira só para mudar layout do formulário;
- chamar `fetch` direto se `useOonApi`/client do Core atende;
- duplicar regra de permissão apenas no frontend;
- hardcode de endpoints quando a metadata pode resolver;
- editar `.ooncore/` manualmente;
- criar variações visuais fora do padrão sem necessidade.

## Implementação disponível no Core

Use `collections[].list` para filtros, colunas e ações da lista principal. Use `collections[].relations` para nomear relações reutilizáveis e `collections[].detailModal.tabs` para declarar abas `summary`, `form`, `relatedGrid`, `readonlyGrid` ou `customComponent`.

Ações por linha (`rowActions`) podem abrir a modal (`openDetailModal`), navegar (`navigate`) ou chamar endpoints (`apiAction`). Condições declarativas (`exists`, `equals`, `notEquals`, `in`, `gt`, `gte`, `lt`, `lte`) controlam visibilidade e bloqueio sem hardcode de Central no Core.

---

<!-- source: AGENT_WORKFLOW.md -->

# Fluxo de trabalho para Agents

1. **Gerar:** para um App novo, siga [OON_APP_AGENT_GUIDE.md](OON_APP_AGENT_GUIDE.md) e confirme que `.ooncore/` foi criada.
2. **Descobrir:** leia `AGENTS.md`, o manifesto documental e [CAPABILITIES.md](CAPABILITIES.md).
3. **Classificar:** separe contrato do Core, domínio da Central e recurso exclusivo da plataforma.
4. **Escolher extensão:** manifesto → validation/trigger/hook/mapping → renderer/rota pequena → código customizado somente se necessário.
5. **Implementar:** use exports públicos documentados; preserve segurança, tenant, auditoria e idempotência.
6. **Executar local:** `npm run dev`, sem cadastro ou conexão com a plataforma; capabilities de plataforma falham fechado.
7. **Validar:** docs check, conformance, testes, typecheck e provas específicas do projeto.
8. **Relatar:** arquivos, contratos usados, riscos, limitações e evidências.

## Regra closed-book

Mantenha os três pacotes OonCore na linha 0.6.x declarada pelo App e sincronize `.ooncore` após qualquer atualização.

Trabalhe somente com o App e sua `.ooncore/`. Não leia fonte privada, `node_modules` ou outros Apps para descobrir como usar o Core. Se faltar assinatura, declaração, exemplo, erro ou limite necessário, interrompa essa parte e registre a lacuna documental.

Prompt operacional:

> Crie ou atualize o Oon App usando exclusivamente a documentação versionada em `.ooncore`. Preserve o domínio e o AGENTS.md do projeto, consulte o catálogo e os contratos públicos de back, front e capabilities, use apenas extensões suportadas, execute os gates e homologue em `127.0.0.1` sem conexão com a plataforma. Não leia fonte privada ou outros Apps e não crie autenticação, ativação, RBAC, CRUD, shell ou infraestrutura paralelos.

---

<!-- source: AGENTS.md -->

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

---

<!-- source: AUTH_ACTIVATION_RBAC.md -->

# Autenticação, ativação e RBAC

## Plataforma

O backend verifica o token no escopo do App, resolve tenant e acesso, aplica a política local de RBAC e cria `req.accessContext`. O frontend usa permissões somente para experiência; o backend autoriza cada operação.

Ativação de plataforma cria a identidade operacional usada por integrações autorizadas. Rotas de login, launch exchange, ativação e primeiro acesso não estão disponíveis no runtime local.

## Catálogo público de perfis

Todo App com RBAC declarado expõe `GET /core/role-catalog`. O contrato `schemaVersion: 1` contém apenas `appCode`, `enabled` e `roles[]` com `code`, `name`, `description` e `admin`. Permissões internas não são expostas.

O catálogo serve para descoberta e seleção de perfis pelo Control Plane. Ele não concede acesso: o backend consumidor deve validar `schemaVersion` e `appCode`, consultar somente o Deployment resolvido pela plataforma, revalidar o perfil antes de persistir o grant e falhar fechado quando o catálogo estiver ausente ou inválido.

## Local

O principal técnico é `local:developer`, sem usuário/tenant/licença na plataforma. O papel inicial é `developer` quando declarado, seguido por admin ou primeiro papel. A troca de perfil aceita apenas o manifesto e atualiza a sessão local.

O estado é `ativa_local`; o `ActivationGuard` não cria nem consulta `InstanciaEcossistema`. Isso não equivale a `ativa` publicada.

## Regras para extensões

- use `requirePermission` em rotas customizadas;
- derive filtros de `req.accessContext`;
- nunca autorize por header/body de perfil ou tenant;
- não implemente `verifyToken` em Central member/portal;
- não persista bearer no frontend;
- não trate simulação local como identidade operacional.


## Apps globais e tenant-alvo

Apps com `tenancyModel=none` não montam `TenantProvider`, não restauram tenant
do storage e não consomem o parâmetro reservado `tenant`. Cockpits globais
devem transportar a organização administrada com um identificador próprio,
como `targetTenantId`, e o BFF deve convertê-lo no header específico do
contrato administrativo. Esse alvo nunca integra a sessão do App.

---

<!-- source: BACKEND_API.md -->

# API pública do `@oondemand/oon-core-back`

Importe exclusivamente de `@oondemand/oon-core-back`. Caminhos internos não têm estabilidade garantida.

## Boot e definição

- `start(options)`: carrega a Central, conecta Mongo, inicializa capabilities e inicia HTTP. `options.listen=false` devolve somente o app.
- `createApp()`: cria o Express já protegido e com rotas do Core.
- `activate()`: fluxo legado de ativação; não é usado no runtime local.
- `defineCentral`, `defineModel`, `defineCollection`, `defineDocument`, `definePipeline`, `defineRoutes`, `defineValidation`, `defineTrigger`: extensões imperativas suportadas.
- `fields`: factories de campos compatíveis com schema e metadata.
- `registry`: registry do processo; use APIs `define*`, não mutações internas.

## Segurança, RBAC e tenant

- `requirePermission(permission)`: middleware obrigatório em rotas sensíveis.
- `CORE_PERMISSIONS`, `rbacPolicy`, `roleByCode`, `permissionGranted`: leitura e avaliação da política declarada.
- `TENANT_HEADER`, `TENANCY_MODELS`, `DATA_SCOPES`: constantes canônicas.
- `createAccessContext`, `readRequestedTenantId`: produzem contexto validado.
- `scopeFilter`, `mergeScopedFilter`, `scopeMutation`, `scopedIdFilter`: aplicam isolamento aos dados. Nunca aceite tenant do body como autoridade.

## Manifestos

- App: `APP_MANIFEST_FILENAME`, `APP_MANIFEST_SCHEMA_VERSION`, `SUPPORTED_APP_KINDS`, `SUPPORTED_APP_MODULES`, `AppManifestError`, `validateAppManifest`, `resolveAppManifestPath`, `appManifestToConfig`, `registerAppManifest`, `loadAppManifest`.
- Domínio: `DOMAIN_MANIFEST_FILENAME`, `DOMAIN_MANIFEST_SCHEMA_VERSION`, `SUPPORTED_DOMAIN_FIELD_KINDS`, `DOMAIN_EXPRESSION_OPERATORS`, `DomainManifestError`, `DomainRuleError`, `validateDomainManifest`, `domainManifestToDefinitions`, `registerDomainManifest`, `loadDomainManifest`, `evaluateDomainExpression`, `applyDomainMutation`, `validateDomainRecord`, `detectChangedFields`.
- Processo: `PROCESS_MANIFEST_FILENAME`, `PROCESS_MANIFEST_SCHEMA_VERSION`, `ProcessManifestError`, `validateProcessManifest`, `registerProcessManifest`, `loadProcessManifest`, `prepareProcessMutation`, `resolveProcessBindings`, `assertReferencePolicies`, `assertAtomicInvariants`, `assertDeleteAllowed`, `recalculateDependents`, `drainProcessJobs`.

Erros de manifesto carregam `code`, `statusCode` e `issues[]` com `path` e `message`.

## Capabilities

O namespace público `capabilities` contém:

- `capabilities.pdf.render(input, context): Promise<Buffer>`; contrato completo em [PDF_RENDERING.md](PDF_RENDERING.md);
- alias compatível `capabilities.pdfRendering.render`;
- `capabilities.transactionalEmail.send(input, context)` e operações administrativas; contrato completo em [TRANSACTIONAL_EMAIL.md](TRANSACTIONAL_EMAIL.md);
- `PdfRenderingError` e `TransactionalEmailError` para normalização específica.

O App nunca configura URL, credencial interna ou implementação de uma capability. A única exceção é a injeção de dublês documentada para testes automatizados.

`operationalRequestHeaders(options)` produz headers de identidade do Deployment. Retorna `LOCAL_OPERATION_NOT_SUPPORTED` no runtime local; nunca improvise identidade local.

## Runtime local

O namespace público `localDevelopment` expõe detecção, validação de loopback e utilitários de teste/integração do runtime. Apps consumidores normalmente apenas definem `OON_RUNTIME_MODE=local` e usam o scaffold.

## Erros

`GenericError(message, { statusCode, code, details })` é o erro operacional base. Rotas devem lançá-lo e deixar o middleware do Core produzir o envelope sanitizado.

---

<!-- source: BACKEND_DOMAIN_MANIFEST.md -->

# Manifesto declarativo de domínio — `central.domain.json`

O arquivo `central.domain.json`, localizado na raiz do backend da Central, declara models, campos, fórmulas e validações sem exigir um arquivo JavaScript por model.

O OonCore carrega o manifesto durante o bootstrap, antes de carregar `src/models`, `src/validations`, `src/triggers` e os demais diretórios de extensão.

> A Central declara o domínio e as regras. O OonCore constrói schema Mongoose, metadata, CRUD, cálculos protegidos e validações.

## Escopo da versão 1

O contrato cobre:

- identidade do manifesto;
- models e seus caminhos de API;
- configuração de CRUD já aceita por `defineModel`;
- campos primitivos, enumerações, referências e moedas;
- obrigatoriedade, valor padrão, busca, unicidade e índice simples;
- limites numéricos e de tamanho de texto;
- campos somente leitura protegidos nas mutações HTTP;
- campos calculados no servidor;
- dependências entre campos calculados, ordenadas automaticamente;
- precisão e tratamento de valores ausentes em fórmulas;
- validações declarativas entre campos, com condição opcional;
- validação estrutural com todos os problemas retornados em uma única exceção.

Ainda não fazem parte desta versão:

- índices compostos;
- triggers e transições declarativas;
- migrações automáticas de dados;
- mappings de integração;
- funções JavaScript embutidas no JSON.

As expressões são interpretadas por um avaliador fechado. O Core não usa `eval`, `Function` ou execução de código vindo do manifesto.

## Exemplo financeiro

```json
{
  "name": "Central SS Eventos",
  "slug": "ss-eventos",
  "schemaVersion": 1,
  "models": [
    {
      "name": "ProjetoItem",
      "singular": "item",
      "basePath": "/itens",
      "crud": {
        "enabled": true
      },
      "fields": {
        "quantidade": {
          "kind": "number",
          "required": true
        },
        "diarias": {
          "kind": "number",
          "required": true
        },
        "valorUnitario": {
          "kind": "currency",
          "required": true
        },
        "percentualFee": {
          "kind": "number",
          "default": 0
        },
        "valorContratado": {
          "kind": "currency",
          "default": 0
        },
        "valorPago": {
          "kind": "currency",
          "default": 0
        },
        "statusIntegracao": {
          "kind": "string",
          "readonly": true
        },
        "subtotal": {
          "kind": "currency",
          "computed": {
            "precision": 2,
            "expression": {
              "op": "multiply",
              "args": [
                { "field": "quantidade" },
                { "field": "diarias" },
                { "field": "valorUnitario" }
              ]
            }
          }
        },
        "valorFee": {
          "kind": "currency",
          "computed": {
            "precision": 2,
            "expression": {
              "op": "divide",
              "args": [
                {
                  "op": "multiply",
                  "args": [
                    { "field": "subtotal" },
                    { "field": "percentualFee" }
                  ]
                },
                { "value": 100 }
              ]
            }
          }
        },
        "total": {
          "kind": "currency",
          "computed": {
            "precision": 2,
            "expression": {
              "op": "add",
              "args": [
                { "field": "subtotal" },
                { "field": "valorFee" }
              ]
            }
          }
        }
      },
      "validations": [
        {
          "name": "pagamento-limitado-ao-contratado",
          "code": "PAGAMENTO_ACIMA_CONTRATADO",
          "field": "valorPago",
          "message": "O valor pago não pode superar o valor contratado.",
          "assert": {
            "op": "lte",
            "args": [
              { "field": "valorPago" },
              { "field": "valorContratado" }
            ]
          }
        }
      ]
    }
  ]
}
```

## Estrutura principal

| Propriedade | Obrigatória | Descrição |
|---|---:|---|
| `name` | sim | Nome legível da declaração de domínio. |
| `slug` | não | Identificador em minúsculas, números e hífens. |
| `schemaVersion` | sim | Nesta versão, deve ser `1`. |
| `models` | sim | Lista não vazia de models. |

## Model

| Propriedade | Obrigatória | Descrição |
|---|---:|---|
| `name` | sim | Nome PascalCase usado no registry e no Mongoose. |
| `singular` | não | Nome singular usado pelo Core. |
| `basePath` | não | Caminho iniciado por `/`. |
| `crud` | não | Mesmo contrato aceito por `defineModel`. |
| `options` | não | Opções JSON compatíveis com o schema Mongoose. |
| `fields` | sim | Objeto com pelo menos um campo. |
| `validations` | não | Lista de regras declarativas executadas depois dos cálculos. |

Não declare a mesma model no manifesto e em `src/models`. O registry interrompe o bootstrap para impedir duas fontes de verdade.

## Tipos de campo

- `string`
- `number`
- `boolean`
- `date`
- `ref`
- `enum`
- `currency`
- `currencyCode`
- `currencyConverted`

### Opções comuns

- `label`: rótulo para metadata e frontend;
- `description`: explicação funcional;
- `required`: campo obrigatório;
- `default`: valor padrão JSON;
- `readonly`: campo controlado pelo servidor;
- `searchable`: inclui texto na busca derivada do Core;
- `unique`: índice único simples;
- `index`: índice simples;
- `computed`: fórmula declarativa para campos numéricos ou monetários.

### Opções por tipo

- textos: `minLength`, `maxLength`;
- números e moedas: `min`, `max`;
- `ref`: `ref` com o nome da model relacionada;
- `enum`: `values` com textos únicos e não vazios;
- `currencyConverted`: `base` com código ISO de três letras.

## Campos calculados

`computed` é permitido em `number`, `currency` e `currencyConverted`.

```json
{
  "kind": "currency",
  "computed": {
    "expression": {
      "op": "multiply",
      "args": [
        { "field": "quantidade" },
        { "field": "valorUnitario" }
      ]
    },
    "precision": 2,
    "nullAsZero": true
  }
}
```

| Propriedade | Padrão | Descrição |
|---|---:|---|
| `expression` | — | Expressão obrigatória. |
| `precision` | `2` | Casas decimais, entre 0 e 8. |
| `nullAsZero` | `true` | Trata campos ausentes ou vazios como zero nas operações numéricas. |

Campos calculados:

- são automaticamente `readonly`;
- recebem `immutable` no schema Mongoose;
- são recalculados no backend em criação, edição, patch e importação;
- são calculados em ordem de dependência;
- não podem formar ciclos;
- aparecem na metadata com `readonly: true` e a declaração `computed`.

## Expressões

Uma expressão declara exatamente um destes nós:

```json
{ "value": 100 }
```

```json
{ "field": "valorUnitario" }
```

```json
{
  "op": "multiply",
  "args": [
    { "field": "quantidade" },
    { "field": "valorUnitario" }
  ]
}
```

### Operadores aritméticos

- `add`
- `subtract`
- `multiply`
- `divide`
- `min`
- `max`
- `abs`
- `negate`
- `coalesce`

### Operadores de comparação

- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`

### Operadores lógicos e de presença

- `and`
- `or`
- `not`
- `present`
- `in`

Divisão por zero e valores não numéricos em fórmulas geram `DomainRuleError` com status 422.

## Validações entre campos

As validações rodam depois que o Core consolidou o registro e recalculou todos os campos dependentes.

```json
{
  "name": "valor-pago-valido",
  "code": "PAGAMENTO_ACIMA_CONTRATADO",
  "field": "valorPago",
  "message": "O valor pago não pode superar o valor contratado.",
  "when": {
    "op": "present",
    "args": [{ "field": "valorPago" }]
  },
  "assert": {
    "op": "lte",
    "args": [
      { "field": "valorPago" },
      { "field": "valorContratado" }
    ]
  }
}
```

| Propriedade | Obrigatória | Descrição |
|---|---:|---|
| `name` | sim | Identificador único da validação dentro da model. |
| `message` | sim | Mensagem operacional apresentada ao usuário. |
| `assert` | sim | Expressão que deve resultar em verdadeiro. |
| `when` | não | Condição para executar a regra. |
| `field` | não | Campo associado ao erro. |
| `code` | não | Código em maiúsculas para tratamento programático. |

Falhas geram `DomainRuleError` com `statusCode: 422`, `code`, `field`, `rule` e detalhes compatíveis com o tratamento de erros do Core.

## Proteção de campos somente leitura

A proteção não depende apenas do frontend.

- valor readonly enviado na criação é rejeitado;
- alteração de valor readonly é rejeitada;
- em edição, o mesmo valor pode voltar no payload e é removido antes da persistência;
- campos calculados podem voltar no payload somente quando coincidem com o resultado calculado pelo servidor;
- tentativa de adulterar um campo calculado é rejeitada;
- services recebem somente campos permitidos e os resultados recalculados.

Isso permite formulários que enviam o registro completo sem abrir espaço para alterar totais, status técnicos ou identificadores controlados pelo sistema.

## Atualizações parciais

Em `PUT` ou `PATCH`, o Core:

1. carrega o registro atual quando existem regras declarativas ou `defineValidation`;
2. remove ou bloqueia campos readonly;
3. consolida os campos atuais com as alterações recebidas;
4. recalcula campos dependentes em ordem;
5. executa validações declarativas;
6. executa a validação JavaScript registrada, quando existir;
7. persiste somente as alterações permitidas e os valores calculados.

A validação JavaScript recebe:

```js
{
  op,
  method,
  id,
  current,
  requestedChanges,
  changes,
  consolidated
}
```

## Erros de validação do manifesto

Um manifesto estruturalmente inválido lança `DomainManifestError`:

```js
{
  name: "DomainManifestError",
  code: "OON_DOMAIN_MANIFEST_INVALID",
  statusCode: 422,
  issues: [
    {
      path: "models[0].fields.total.computed.expression",
      message: "dependência circular entre campos calculados: total -> fee -> total."
    }
  ]
}
```

A validação agrega os problemas para que o autor corrija o documento em uma única rodada.

## APIs públicas

```js
const {
  validateDomainManifest,
  domainManifestToDefinitions,
  registerDomainManifest,
  loadDomainManifest,
  evaluateDomainExpression,
  applyDomainMutation,
  DomainManifestError,
  DomainRuleError,
  DOMAIN_EXPRESSION_OPERATORS
} = require("@oondemand/oon-core-back");
```

Na operação normal não é necessário chamar essas funções: `oonCore-back start` descobre automaticamente `central.domain.json` e o CRUD aplica as regras.

## Compatibilidade durante a migração

Os diretórios JavaScript continuam disponíveis para regras ainda não declarativas. A ordem é:

1. `central.config.js`;
2. `central.domain.json`;
3. diretórios em `src/`.

Isso permite migrar model por model. `defineValidation` continua disponível e roda depois das fórmulas e validações declarativas.

---

<!-- source: BACKEND_PATTERNS.md -->

# Padrões Backend

O backend da Central deve conter apenas domínio e extensões. Boot, infraestrutura, CRUD padrão, autenticação, RBAC e metadata pertencem ao `@oondemand/oon-core-back`.

## Estrutura esperada

```txt
backend/
├── central.config.js
├── central.manifest.json
└── src/
    ├── models/
    ├── validations/
    ├── triggers/
    ├── hooks/
    ├── mappings/
    ├── documents/
    ├── pipelines/
    ├── routes/
    ├── controllers/
    └── services/
```

## Models

Use models para declarar entidades de negócio. Cada model deve ser pequeno, com nomes claros e campos compatíveis com as telas e processos.

Boas práticas:

- use campos explícitos;
- defina tipos, obrigatoriedade e enums quando aplicável;
- preserve campos de status para esteiras;
- evite regras complexas diretamente no schema;
- evite dependência direta de frontend.

## Validations

Use validations para regras de negócio síncronas e mensagens claras para o usuário.

Exemplos:

- campo obrigatório condicional;
- status permitido para transição;
- valor mínimo/máximo;
- combinação inválida de campos;
- bloqueio por permissão ou perfil.

Em inclusões, a validation recebe os dados enviados. Em atualizações por `PUT` ou `PATCH`, o OonCore carrega o registro atual e entrega à validation o registro consolidado com as alterações. Isso permite que formulários em abas e datagrids enviem somente os campos modificados sem perder referências obrigatórias durante a validação.

O segundo argumento informa o contexto da operação:

```js
async function validar(dados, contexto) {
  // contexto.op: "create" ou "update"
  // contexto.method: "post", "put" ou "patch"
  // contexto.id: identificador do registro em updates
  // contexto.current: registro antes da alteração
  // contexto.changes: somente os campos enviados
  // contexto.consolidated: registro completo usado em `dados`
}
```

A validation deve avaliar `dados` como estado final pretendido. Use `contexto.changes` apenas quando a regra depender de quais campos foram efetivamente alterados.

## Triggers e hooks

Use triggers e hooks para efeitos controlados depois ou antes de alterações.

Exemplos:

- criar ticket de integração;
- recalcular campos derivados;
- gerar histórico operacional;
- disparar conector;
- atualizar etapa da esteira.

Regras:

- trigger não deve esconder regra crítica sem validação;
- evite efeitos irreversíveis sem log;
- integração externa deve passar por camada de integração/conector;
- falhas de integração devem gerar status rastreável, não quebrar silenciosamente o processo.

## Rotas customizadas

Crie rotas customizadas somente quando o CRUD/metadata do Core não resolver.

Toda rota customizada deve ter:

- autenticação;
- verificação de permissão;
- validação de entrada;
- tratamento de erro;
- resposta padronizada;
- ausência de segredo hardcoded.

## Serviços

Use `services/` para regras reutilizáveis. Evite controllers grandes.

## Segurança

Nunca confie no frontend para permissão, tenant, app ou perfil. O backend deve validar tudo que altera dados, dispara integrações ou expõe informações sensíveis.

---

<!-- source: BACKEND_PROCESS_MANIFEST.md -->

# Manifesto backend de processos

O arquivo opcional `backend/central.process.json` declara capacidades de processo que pertencem ao OonCore e não à implementação local de uma Central.

Ele complementa:

- `central.app.json`: identidade, módulos e capabilities da aplicação;
- `backend/central.domain.json`: models, campos, fórmulas do próprio registro e validações locais;
- `frontend/src/app`: composição code-first de coleções, esteiras e ações exibidas.

O manifesto de processos é carregado **depois** do domínio. Por isso, toda model e todo campo citados precisam existir em `central.domain.json`.

## Contrato mínimo

```json
{
  "schemaVersion": 1,
  "models": {
    "Pagamento": {
      "workflow": {},
      "bindings": [],
      "deleteProtection": [],
      "atomicInvariants": []
    }
  }
}
```

O runtime não executa JavaScript, `eval`, nomes de funções ou módulos informados no JSON. Expressões usam a mesma AST fechada das regras de domínio.

## Workflow e transições

```json
{
  "workflow": {
    "stageField": "etapa",
    "initialStages": ["Solicitado"],
    "defaultStage": "Solicitado",
    "transitions": [
      { "from": "Solicitado", "to": "Aprovado" },
      {
        "from": "Aprovado",
        "to": "Aguardando NF",
        "when": {
          "op": "eq",
          "args": [
            { "field": "aprovadoFinanceiro" },
            { "value": true }
          ]
        }
      }
    ],
    "lockedFieldsByStage": {
      "Enviado para pagamento": ["valor", "projetoId", "projetoItemId"],
      "Pagamento Ok": ["valor", "projetoId", "projetoItemId"]
    },
    "lockedMessage": "Os dados de negócio ficam bloqueados nesta etapa.",
    "onEnter": [
      {
        "stage": "Enviado para pagamento",
        "set": {
          "statusTrabalho": "Trabalhando",
          "statusPagamento": "Pendente"
        }
      }
    ],
    "automaticTransitions": [
      {
        "when": {
          "op": "eq",
          "args": [
            { "field": "pagamentoLiquidado" },
            { "value": true }
          ]
        },
        "to": "Pagamento Ok",
        "set": { "statusTrabalho": "Trabalhando" }
      }
    ]
  }
}
```

Regras importantes:

- o backend compara o valor anterior e o novo; enviar novamente a mesma etapa não cria uma transição;
- uma mudança manual precisa existir em `transitions` e satisfazer `when`;
- `lockedFieldsByStage` é aplicado sobre a etapa anterior e impede alterações de negócio mesmo por `PUT` ou `PATCH` diretos;
- `onEnter` produz alterações confiáveis do Core;
- `automaticTransitions` é executado pelo servidor depois dos bindings e não depende do frontend.

A UI pode continuar declarando botões `transition` e `setField`. Ela é uma projeção; a autoridade permanece no backend.

## Bindings cross-model

Bindings preenchem campos derivados a partir de outra model ou de registros relacionados. Todos são resolvidos em lote.

### Lookup

```json
{
  "field": "percentualFeeAplicado",
  "kind": "lookup",
  "sourceModel": "Projeto",
  "localField": "projetoId",
  "sourceField": "percentualFee",
  "watchFields": ["percentualFee"],
  "recalculate": "async",
  "default": 0
}
```

Quando `Projeto.percentualFee` muda, o Core encontra os itens dependentes e agenda um recálculo assíncrono. O recálculo usa uma leitura por binding e um `bulkWrite`, em vez de executar `save()` item a item na requisição do usuário.

### Agregação de relacionamento

```json
{
  "field": "pagamentoTotalPlanejado",
  "kind": "aggregate",
  "sourceModel": "Pagamento",
  "foreignField": "projetoItemId",
  "operator": "sum",
  "sourceField": "valor",
  "match": {
    "canceladoNaCentral": { "neq": true }
  },
  "default": 0
}
```

Operadores disponíveis:

- `sum`;
- `count`;
- `min`;
- `max`.

Filtros aceitam igualdade direta ou `{ "eq": ... }`, `{ "neq": ... }`, `{ "in": [...] }` e `{ "nin": [...] }`.

### Expressão derivada

```json
{
  "field": "pagamentoValorPendente",
  "kind": "expression",
  "precision": 2,
  "expression": {
    "op": "max",
    "args": [
      { "value": 0 },
      {
        "op": "subtract",
        "args": [
          { "field": "contratacaoTotal" },
          { "field": "pagamentoTotalPago" }
        ]
      }
    ]
  }
}
```

Bindings são avaliados na ordem declarada. Assim, uma expressão pode consumir lookups e agregações anteriores.

Além dos operadores numéricos e lógicos do domínio, processos podem usar:

- `if`: condição, valor verdadeiro e valor falso;
- `concat`: concatenação segura de valores;
- `formatCurrency`: valor, moeda opcional e locale opcional.

## Recálculo imediato e assíncrono

`recalculate` controla a reação quando a model de origem muda:

- `immediate` (padrão): dependentes são atualizados no mesmo ciclo da mutação;
- `async`: a resposta não percorre todos os dependentes; o Core coloca o recálculo na fila interna e usa operações em lote.

Use `async` para alterações de um pai com muitos filhos, como a mudança de percentuais de um Projeto. Use `immediate` quando o registro pai precisa refletir a alteração antes da resposta, como o resumo de pagamentos de um item.

A API `drainProcessJobs()` existe para testes e homologações determinísticas.

## Proteção declarativa de exclusão

```json
{
  "deleteProtection": [
    {
      "sourceModel": "Pagamento",
      "foreignField": "projetoItemId",
      "message": "Não é possível excluir o item porque existem pagamentos vinculados."
    }
  ]
}
```

A verificação ocorre no CRUD oficial antes de `findByIdAndDelete`. Não é necessário sobrescrever métodos do Mongoose.

## Invariável financeira atômica

```json
{
  "atomicInvariants": [
    {
      "name": "pagamentos-limitados-ao-contratado",
      "kind": "relatedSumLteParentField",
      "parentModel": "ProjetoItem",
      "parentLocalField": "projetoItemId",
      "sourceField": "valor",
      "parentField": "contratacaoTotal",
      "match": {
        "canceladoNaCentral": { "neq": true }
      },
      "tolerance": 0.01,
      "code": "PAGAMENTO_ACIMA_CONTRATADO",
      "message": "A soma {total} não pode ultrapassar o valor contratado {limit}."
    }
  ]
}
```

O Core executa a mutação em transação MongoDB e incrementa uma versão interna no registro pai antes de calcular a soma. Duas inclusões simultâneas disputam a mesma escrita do pai:

1. uma transação conclui;
2. a outra recebe conflito transitório;
3. o Core repete a transação;
4. a soma é refeita já considerando a primeira inclusão;
5. a segunda inclusão é aceita ou rejeitada pela invariável.

Uma simples validação `find + sum + save`, fora de transação, **não** oferece essa garantia.

## Alterações reais

O contexto enviado a `defineValidation` agora inclui `changedFields`. A lista contém somente campos cujo valor final difere do registro anterior, incluindo valores derivados pelo Core. Isso evita efeitos colaterais acionados por round-trips de campos sem alteração real.

## Fronteira recomendada

Pertence ao Core/process manifest:

- transições e bloqueios de etapa;
- status operacionais recorrentes;
- dependências e recálculos cross-model;
- agregações relacionadas;
- proteção de exclusão;
- invariáveis concorrentes;
- processamento em lote/assíncrono.

Permanece na Central:

- fórmula comercial específica;
- tipos de responsáveis permitidos pelo negócio;
- regras fiscais específicas;
- integrações e mapeamentos particulares;
- mensagens e condições próprias do processo.

A Central declara essas particularidades usando o contrato; não reimplementa o mecanismo.

---

<!-- source: CAPABILITIES.md -->

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

---

<!-- source: CHECKLIST_IMPLEMENTACAO.md -->

# Checklist de Implementação

Use este checklist antes de concluir qualquer tarefa de codificação em uma Central Oon.

## Contexto e documentação

- [ ] Rodei `npm run ooncore:docs:check`.
- [ ] Rodei `npm run ooncore:docs` se havia documentação desatualizada.
- [ ] Li `.ooncore/AGENTS.md` e o guia de autoria.
- [ ] Consultei o catálogo e o contrato dedicado de cada capability usada.
- [ ] Trabalhei somente com a árvore do App e `.ooncore/`, sem fonte privada, `node_modules` ou outros Apps.
- [ ] Registrei qualquer lacuna em vez de inventar API ou infraestrutura.
- [ ] Entendi qual recurso do Core já resolve parte da necessidade.

## Backend

- [ ] Usei model, validation, trigger, hook ou mapping quando aplicável.
- [ ] Evitei recriar CRUD.
- [ ] Validei entrada.
- [ ] Validei permissão no backend.
- [ ] Propaguei tenant, correlação, cancelamento e idempotência quando aplicáveis.
- [ ] Tratei erros pelo contrato público.
- [ ] Não hardcodei segredos, endpoints internos ou implementations.
- [ ] Mantive rastreabilidade sem registrar conteúdo sensível.

## Frontend

- [ ] Defini o App com `defineOonApp` e `startOonApp`.
- [ ] Reutilizei shell, guards, primitives e padrões públicos do Core.
- [ ] Mantive rotas, navegação, páginas, layouts e temas no código do App.
- [ ] Usei `useOonApi` para chamadas autenticadas e respostas binárias.
- [ ] Não coloquei regra crítica apenas no frontend.

## Integrações e capabilities

- [ ] Fiz a declaração no manifesto indicado pelo guia.
- [ ] Usei camada de integração/capability pública.
- [ ] Modelei mapping e status operacional quando necessário.
- [ ] Normalizei erros externos e respeitei `retryable`.
- [ ] O runtime local falha fechado ou usa dublê somente no teste.
- [ ] Não expus credenciais.

## Entrega

- [ ] `npm run ooncore:docs:check` passou.
- [ ] `npm run ooncore:conformance` passou.
- [ ] `npm run check` e `npm test` passaram.
- [ ] Provei o fluxo específico do usuário.
- [ ] A Central continua atualizável com novas versões do Core.
- [ ] A alteração é pequena, coesa e aderente à arquitetura.
- [ ] O comportamento específico do App está documentado sem duplicar contrato do Core.

---

<!-- source: CODEX.md -->

# CODEX.md — ponte de compatibilidade

A fonte canônica, completa e neutra do OonCore é `AGENTS.md`.

Ao trabalhar em uma Central:

1. leia primeiro o `AGENTS.md` da raiz do projeto, quando existir;
2. leia `.ooncore/AGENTS.md`;
3. valide `.ooncore/manifest.json` com `npm run ooncore:docs:check`;
4. siga as referências de `.ooncore/docs/` indicadas para a tarefa.

Não mantenha regras exclusivas neste arquivo. Codex, ChatGPT, Kimi, Manus e outros Agents devem consumir o mesmo contrato versionado.

---

<!-- source: COLLECTIONS_AND_PIPELINES.md -->

# Coleções, Documentos e Esteiras

Coleções, documentos e esteiras são a base operacional da Central Oon.

## Coleções

Use coleções para entidades de negócio:

- clientes;
- fornecedores;
- pedidos;
- pagamentos;
- documentos fiscais;
- serviços tomados;
- serviços prestados;
- integrações;
- tickets operacionais.

Cada coleção deve ter:

- model no backend;
- metadata para CRUD;
- campos de status quando participar de esteira;
- validações de negócio;
- configuração de tela no frontend.

## Documentos

Use documentos para entidades que exigem governança documental, aprovação, anexos ou histórico específico.

Exemplos:

- NF;
- contrato;
- proposta;
- comprovante;
- ordem de serviço;
- pedido de compra.

## Esteiras de processo

Use esteiras para fluxos operacionais com etapas claras.

Boas práticas:

- status/etapa deve estar no backend;
- transições devem ser validadas;
- ações devem registrar usuário e data;
- exceções devem ter status próprio;
- cada etapa deve representar uma decisão operacional real.

## Esteiras de integração

Use esteiras de integração para acompanhar comunicação com sistemas externos.

Estados recomendados:

- pendente;
- em processamento;
- enviado;
- concluído;
- falha;
- aguardando retry;
- cancelado.

Integrações não devem ser caixas-pretas. O usuário operacional precisa enxergar o que aconteceu, qual erro ocorreu e qual ação pode ser tomada.

---

<!-- source: CORE_UPGRADE.md -->

# Atualização coordenada do OonCore

Os três pacotes devem permanecer na mesma linha:

- `@oondemand/oon-core-back`;
- `@oondemand/oon-core-front`;
- `@oondemand/create-central-oon`.

## Procedimento para Agent

1. Leia o `AGENTS.md` da raiz e preserve regras/domínio do projeto.
2. Registre versões atuais, lockfiles e `central.app.json`.
3. Atualize os três pacotes para a mesma versão `0.6.x`.
4. Ajuste compatibilidade para `>=0.6.0 <0.7.0` somente quando a migração estiver pronta.
5. Rode `npm run ooncore:docs` e revise o diff de `.ooncore/`.
6. Remova `DEV_TOKEN`, `VITE_DEV_TOKEN`, tokens fixos e URLs da plataforma do caminho local.
7. Preserve `AGENTS.md` raiz, models, regras, provas e documentação do domínio.
8. Execute docs check, conformance, typecheck, testes e smoke offline.

Não atualize somente um pacote e não copie arquivos do Core manualmente para a Central.

---

<!-- source: DETAIL_MODAL_AND_RELATED_GRIDS.md -->

# DETAIL_MODAL_AND_RELATED_GRIDS.md — Modal com Abas e Grids Relacionados

Este documento define o contrato desejado para evoluir o `@oondemand/oon-core-front` com modal de detalhe, abas, grids relacionados, edição inline e ações por linha.

Status: **especificação para implementação**.

## 1. Motivação

Centrais operacionais frequentemente têm uma entidade principal com filhos operacionais.

Exemplos:

- Projeto -> Itens -> Pagamentos
- Pedido -> Produtos -> Expedições
- Contrato -> Parcelas -> Documentos
- Cliente -> Atividades -> Histórico
- Migração -> Registros -> Exceções

Hoje, esses casos tendem a virar páginas customizadas. O objetivo é abstrair o padrão no Core.

## 2. Resultado esperado

O manifesto deve ser capaz de declarar:

```txt
Grid principal da coleção
└── ação editar
    └── modal com abas
        ├── Resumo
        ├── Dados Principais
        ├── Itens relacionados editáveis inline
        └── Pagamentos/Histórico somente leitura
```

## 3. Extensão proposta do manifesto

### 3.1. Collections com list e detailModal

```json
{
  "model": "OrcamentoProjeto",
  "mode": "dynamic",
  "path": "/orcamentos-projetos",
  "label": "Orçamentos/Projetos",
  "section": "Operação",
  "list": {
    "filters": [],
    "columns": [],
    "rowActions": []
  },
  "relations": {},
  "detailModal": {
    "enabled": true,
    "titleField": "nome",
    "size": "xl",
    "defaultTab": "resumo",
    "tabs": []
  }
}
```

### 3.2. list.filters

Filtros declarativos renderizados acima do grid.

```json
{
  "field": "tipoRegistro",
  "label": "Tipo",
  "type": "select",
  "options": [
    { "label": "Orçamentos e projetos", "value": "" },
    { "label": "Só orçamentos", "value": "Orçamento" },
    { "label": "Só projetos", "value": "Projeto" }
  ]
}
```

Tipos iniciais:

- `text`
- `select`
- `date`
- `dateRange`
- `numberRange`
- `boolean`
- `ref`

### 3.3. list.rowActions

Ações no grid principal.

```json
{
  "type": "openDetailModal",
  "label": "Editar",
  "icon": "edit",
  "initialTab": "resumo"
}
```

Tipos iniciais:

- `openDetailModal`
- `navigate`
- `apiAction`
- `customAction`

### 3.4. relations

Relações nomeadas reutilizáveis por abas, filtros e ações.

```json
{
  "relations": {
    "itens": {
      "model": "OrcamentoItem",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    },
    "pagamentos": {
      "model": "Pagamento",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    }
  }
}
```

## 4. Abas suportadas

### 4.1. summary

Cards de resumo.

```json
{
  "id": "resumo",
  "label": "Resumo",
  "type": "summary",
  "cards": [
    { "label": "Itens", "source": "relatedCount", "relation": "itens" },
    { "label": "Total PARA", "field": "totalParaComImpostos", "format": "currency" }
  ]
}
```

Fontes:

- `field`
- `relatedCount`
- `relatedSum`
- `relatedAvg`
- `customMetric`

Formatos:

- `text`
- `number`
- `currency`
- `percent`
- `date`
- `badge`

### 4.2. form

Formulário do registro principal.

```json
{
  "id": "dados",
  "label": "Dados Principais",
  "type": "form",
  "groups": [
    {
      "label": "Identificação",
      "fields": ["tipoRegistro", "codigo", "nome", "status"]
    }
  ]
}
```

### 4.3. relatedGrid

Grid de filhos editável ou não.

```json
{
  "id": "itens",
  "label": "Itens",
  "type": "relatedGrid",
  "relation": "itens",
  "editable": true,
  "editMode": "inline",
  "columns": [],
  "rowActions": []
}
```

### 4.4. readonlyGrid

Grid relacionado somente leitura.

```json
{
  "id": "pagamentos",
  "label": "Pagamentos",
  "type": "readonlyGrid",
  "relation": "pagamentos",
  "columns": ["codigo", "descricao", "statusEsteira", "valorFechamento"]
}
```

### 4.5. customComponent

Aba com componente customizado registrado por chave.

```json
{
  "id": "analise",
  "label": "Análise",
  "type": "customComponent",
  "component": "custom:AnaliseProjeto"
}
```

## 5. Colunas de relatedGrid

```json
{
  "field": "totalParaComImpostos",
  "label": "Total PARA",
  "editable": true,
  "format": "currency",
  "width": 140
}
```

Propriedades:

- `field`
- `label`
- `editable`
- `readonly`
- `format`
- `renderer`
- `editor`
- `width`
- `hidden`
- `roles`
- `required`

## 6. Edição inline

O grid editável deve manter alterações em estado local por linha.

Requisitos:

- célula editável conforme metadata do campo;
- linha marcada como alterada;
- botão `Salvar` por linha;
- botão `Cancelar` por linha;
- `PUT /:modelPath/:id` usando CRUD genérico;
- loading por linha;
- erro por linha;
- refresh pós-salvamento configurável.

## 7. Row actions

### 7.1. apiAction

```json
{
  "id": "gerarPagamento",
  "label": "Gerar pagamento",
  "type": "apiAction",
  "method": "POST",
  "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
  "confirm": {
    "title": "Gerar pagamento?",
    "description": "Será criado um ticket financeiro vinculado a este item."
  },
  "disabledWhen": {
    "field": "pagamentoId",
    "exists": true
  },
  "refresh": ["self", "pagamentos", "resumo", "parent"]
}
```

### 7.2. Interpolação de endpoint

Suportar:

- `:id` -> `_id` da linha;
- `:parentId` -> `_id` do registro pai;
- `:fieldName` -> valor do campo na linha;
- `:parent.fieldName` -> valor do campo no pai.

### 7.3. disabledWhen

Operadores mínimos:

```json
{ "field": "pagamentoId", "exists": true }
{ "field": "status", "equals": "Cancelado" }
{ "field": "valor", "gt": 0 }
{ "field": "tipo", "in": ["A", "B"] }
```

### 7.4. refresh

Alvos:

- `self`: grid/aba atual;
- `parent`: registro principal;
- nome de aba: `pagamentos`, `resumo` etc.;
- `all`: todas as queries da modal.

## 8. RBAC

Cada nível pode ter `roles` ou `permissions`.

```json
{
  "id": "gerarPagamento",
  "roles": ["admin", "financeiro"]
}
```

A UI deve ocultar/desabilitar conforme permissão, mas a autoridade final continua no backend.

## 9. Componentes Core necessários

### CoreDetailModal

Responsável por:

- abrir detalhe/criação;
- buscar registro principal;
- controlar abas;
- salvar dados principais;
- orquestrar refresh;
- validar RBAC visual;
- renderizar erros.

### CoreTabbedDetail

Renderiza abas configuradas no manifesto.

### CoreRelatedGrid

Renderiza grid relacionado pelo `relation`.

### CoreInlineEditableCell

Renderiza o editor apropriado por tipo de campo.

### CoreRowAction

Executa ações declaradas por linha.

### CoreSummaryCards

Renderiza cards de resumo por fields e agregações relacionadas.

## 10. Compatibilidade

A implementação deve ser compatível com manifestos existentes.

- `collections[]` atual continua funcionando.
- `detailModal` é opcional.
- `list` é opcional.
- Sem `rowActions`, mantém ação padrão do Core.
- Sem `form.groups`, mantém formulário atual.

## 11. Critérios de aceite

- O manifesto consegue declarar a tela de Orçamentos/Projetos da SS Eventos sem página React customizada.
- A tela principal renderiza filtros, busca, grid e ação editar.
- A ação editar abre modal com abas.
- A aba Dados Principais salva o registro pai.
- A aba Itens carrega apenas filhos do pai selecionado.
- A aba Itens permite edição inline por linha.
- A aba Itens executa ação `Gerar pagamento` por linha.
- Após gerar pagamento, o item mostra badge de pagamento gerado.
- A aba Pagamentos recarrega automaticamente.
- A aba Resumo atualiza contadores/totais.
- RBAC visual respeita roles/permissions declaradas.
- Sem regressão em coleções simples.

## 12. Exemplo completo SS Eventos

```json
{
  "model": "OrcamentoProjeto",
  "mode": "dynamic",
  "path": "/orcamentos-projetos",
  "label": "Orçamentos/Projetos",
  "section": "Operação",
  "list": {
    "filters": [
      {
        "field": "tipoRegistro",
        "label": "Tipo",
        "type": "select",
        "options": [
          { "label": "Orçamentos e projetos", "value": "" },
          { "label": "Só orçamentos", "value": "Orçamento" },
          { "label": "Só projetos", "value": "Projeto" }
        ]
      }
    ],
    "columns": ["tipoRegistro", "codigo", "nome", "cliente", "status", "totalItens", "totalParaComImpostos", "lucroTotalEvento"],
    "rowActions": [
      { "type": "openDetailModal", "label": "Editar", "icon": "edit", "initialTab": "resumo" }
    ]
  },
  "relations": {
    "itens": { "model": "OrcamentoItem", "foreignKey": "projetoId", "parentKey": "_id" },
    "pagamentos": { "model": "Pagamento", "foreignKey": "projetoId", "parentKey": "_id" }
  },
  "detailModal": {
    "enabled": true,
    "titleField": "nome",
    "defaultTab": "resumo",
    "tabs": [
      {
        "id": "resumo",
        "label": "Resumo",
        "type": "summary",
        "cards": [
          { "label": "Itens", "source": "relatedCount", "relation": "itens" },
          { "label": "Pagamentos", "source": "relatedCount", "relation": "pagamentos" },
          { "label": "Total PARA", "field": "totalParaComImpostos", "format": "currency" },
          { "label": "Lucro", "field": "lucroTotalEvento", "format": "currency" }
        ]
      },
      {
        "id": "dados",
        "label": "Dados Principais",
        "type": "form",
        "groups": [
          { "label": "Identificação", "fields": ["tipoRegistro", "codigo", "nome", "status", "cliente"] },
          { "label": "Evento", "fields": ["dataEvento", "localEvento", "contato"] },
          { "label": "Totais", "fields": ["totalItens", "totalParaComImpostos", "lucroTotalEvento"] }
        ]
      },
      {
        "id": "itens",
        "label": "Itens",
        "type": "relatedGrid",
        "relation": "itens",
        "editable": true,
        "editMode": "inline",
        "columns": [
          { "field": "linhaPlanilha", "readonly": true },
          { "field": "categoria", "editable": true },
          { "field": "item", "editable": true },
          { "field": "fornecedorRazaoSocial", "editable": true },
          { "field": "status", "editable": true },
          { "field": "totalParaComImpostos", "editable": true, "format": "currency" },
          { "field": "formaPagamento", "editable": true },
          { "field": "pagamentoId", "label": "Pagamento", "readonly": true, "display": "badgeExists" }
        ],
        "rowActions": [
          {
            "id": "gerarPagamento",
            "label": "Gerar pagamento",
            "type": "apiAction",
            "method": "POST",
            "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
            "disabledWhen": { "field": "pagamentoId", "exists": true },
            "refresh": ["self", "pagamentos", "resumo", "parent"]
          }
        ]
      },
      {
        "id": "pagamentos",
        "label": "Pagamentos",
        "type": "readonlyGrid",
        "relation": "pagamentos",
        "columns": ["codigo", "descricao", "fornecedorRazaoSocial", "statusEsteira", "valorFechamento", "formaPagamento", "dataPagamento"]
      }
    ]
  }
}
```

## 11. Status implementado no Core

O `@oondemand/oon-core-front` implementa o contrato acima de forma genérica nos componentes `CoreDetailModal`, `CoreTabbedDetail`, `CoreSummaryCards`, `CoreRelatedGrid`, `CoreInlineEditableCell` e `CoreRowAction`.

Exemplo completo:

```json
{
  "model": "OrcamentoProjeto",
  "mode": "dynamic",
  "path": "/orcamentos-projetos",
  "label": "Orçamentos/Projetos",
  "section": "Operação",
  "list": {
    "filters": [{ "field": "tipoRegistro", "label": "Tipo", "type": "select", "options": [{ "label": "Todos", "value": "" }] }],
    "rowActions": [{ "type": "openDetailModal", "label": "Editar", "initialTab": "resumo" }]
  },
  "relations": {
    "itens": { "model": "OrcamentoItem", "foreignKey": "projetoId", "parentKey": "_id" },
    "pagamentos": { "model": "Pagamento", "foreignKey": "projetoId", "parentKey": "_id" }
  },
  "detailModal": {
    "enabled": true,
    "titleField": "nome",
    "defaultTab": "resumo",
    "tabs": [
      { "id": "resumo", "label": "Resumo", "type": "summary", "cards": [{ "label": "Itens", "source": "relatedCount", "relation": "itens" }] },
      { "id": "dados", "label": "Dados Principais", "type": "form", "groups": [{ "label": "Identificação", "fields": ["codigo", "nome", "status"] }] },
      { "id": "itens", "label": "Itens", "type": "relatedGrid", "relation": "itens", "editable": true, "editMode": "inline", "columns": ["item", "status"] },
      { "id": "pagamentos", "label": "Pagamentos", "type": "readonlyGrid", "relation": "pagamentos", "columns": ["codigo", "valorFechamento"] }
    ]
  }
}
```

`rowActions` do tipo `apiAction` suportam interpolação de `:id`, `:parentId`, `:fieldName` e `:parent.fieldName`, além de `confirm`, `disabledWhen`, `hiddenWhen` e `refresh` com `self`, `parent`, `all` ou o id de uma aba.

---

<!-- source: DO_AND_DONT.md -->

# Do and Don't

## Faça

- Use o Core antes de criar código novo.
- Modele o domínio com clareza.
- Prefira configuração e metadata.
- Escreva validações explícitas.
- Mantenha regras críticas no backend.
- Use esteiras para processos com status.
- Use conectores para integrações.
- Registre erros de forma operacional.
- Mantenha compatibilidade com atualização dos pacotes.
- Atualize `.ooncore/` com `npm run ooncore:docs`.

## Não faça

- Não recrie CRUD.
- Não recrie autenticação.
- Não duplique RBAC no frontend.
- Não criar um frontend inteiro se um override resolve.
- Não chamar APIs externas direto de qualquer lugar.
- Não hardcode tenant, app, usuário, URL sensível ou segredo.
- Não colocar regra crítica apenas no frontend.
- Não ignorar logs e rastreabilidade.
- Não editar `.ooncore/context.generated.md` manualmente.
- Não depender de documentação externa para codificar a arquitetura.

---

<!-- source: ERRORS.md -->

# Contrato de erros

Erros operacionais usam `{ error: { code, message, details?, requestId? } }` e status HTTP coerente.

| Código | Significado |
|---|---|
| `LOCAL_RUNTIME_ENV_INVALID` | modo local fora de development |
| `LOCAL_RUNTIME_PLATFORM_IDENTITY` | identidade de plataforma/Kubernetes presente |
| `LOCAL_RUNTIME_BIND_FORBIDDEN` | bind fora de loopback |
| `LOCAL_HOST_FORBIDDEN` / `LOCAL_ORIGIN_FORBIDDEN` | acesso de rede recusado |
| `LOCAL_PROXY_FORBIDDEN` | tentativa de proxy no modo local |
| `LOCAL_BOOTSTRAP_INVALID` | código ausente, reutilizado ou expirado |
| `LOCAL_SESSION_INVALID` | cookie ausente, inválido ou expirado |
| `LOCAL_CSRF_INVALID` | mutação sem prova CSRF |
| `LOCAL_ROLE_NOT_DECLARED` | perfil fora do manifesto |
| `LOCAL_OPERATION_NOT_SUPPORTED` | recurso exclusivo da plataforma |

Não faça branching por texto de mensagem; use `code`. Logs e respostas nunca devem conter token, cookie, credencial, senha ou conteúdo sensível.

---

<!-- source: FRONTEND_API.md -->

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

---

<!-- source: FRONTEND_CODE_FIRST.md -->

# Frontend code-first

O frontend de todo App Oon é composto em TypeScript/React. O `appKind` não
limita páginas, componentes, layouts ou temas locais.

```tsx
import { defineOonApp, startOonApp } from "@oondemand/oon-core-front";
import { defineOonNavigation, defineOonRoutes } from "@oondemand/oon-core-front/routing";
import { HomePage } from "./pages/HomePage";

const routes = defineOonRoutes([{ path: "/", element: <HomePage /> }]);
const navigation = defineOonNavigation([{ id: "home", label: "Início", to: "/" }]);

startOonApp(defineOonApp({
  app: { id: "meu-app", name: "Meu App" },
  api: { baseUrl: import.meta.env.VITE_API_URL },
  routes,
  navigation,
}));
```

Rotas aceitam `element`, `component`, `lazy`, `layout`, `permissions` e
`capabilities`. Rotas de autenticação e estados de ativação são reservadas.

Use os subpaths públicos:

- `@oondemand/oon-core-front/ui` para primitives e padrões;
- `@oondemand/oon-core-front/routing` para rotas e navegação;
- `@oondemand/oon-core-front/theme` para temas;
- `@oondemand/oon-core-front/hooks` para hooks;
- `@oondemand/oon-core-front/testing` para testes.

Não carregue código remoto, não desative guards, não exponha segredos no bundle
e não importe arquivos internos do pacote. Rode `npm run ooncore:conformance`.

---

<!-- source: FRONTEND_PATTERNS.md -->

# Padrões Frontend

O frontend do App é code-first. Shell, providers e guards pertencem ao
`@oondemand/oon-core-front`; rotas, navegação, páginas, componentes, layouts e
temas são compostos localmente com as APIs públicas do Core.

Para o contrato completo, use `FRONTEND_CODE_FIRST.md`.
Para UX avançada com abas e itens relacionados, use também `ADVANCED_UX_PATTERNS.md` e `DETAIL_MODAL_AND_RELATED_GRIDS.md`.

## Estrutura esperada

```txt
frontend/
└── src/
    ├── main.tsx
    ├── app/{app,routes,navigation,theme}.tsx
    ├── pages/
    ├── components/
    ├── features/
    └── layouts/
```

## Composição

Use o objeto criado por `defineOonApp` para compor:

- menu;
- coleções;
- campos exibidos;
- filtros;
- ações;
- formulários;
- documentos;
- esteiras;
- dashboards;
- agrupamentos;
- layout v2;
- páginas por blocos;
- renderers por chave;
- modais de detalhe;
- abas;
- relações;
- grids relacionados;
- edição inline;
- ações por linha.

Views e blocos declarativos continuam opcionais para telas simples, dentro do
objeto code-first. Componentes React são registrados diretamente em TypeScript.

## Padrão de tela operacional

A tela principal de uma coleção operacional deve ser simples:

```txt
Título
Filtros
Busca
Botão novo
Grid principal
Ações por linha
```

Ela não deve acumular detalhe de filhos, formulários longos ou fluxos complexos abaixo do grid. Use `detailModal` para concentrar a operação do registro.

## Padrão de detalhe avançado

Quando a operação envolve um registro principal e seus relacionamentos, use:

```txt
CoreDetailModal
├── Resumo
├── Dados Principais
├── RelatedGrid editável
└── ReadonlyGrid
```

Exemplos:

- Projeto -> Itens -> Pagamentos
- Pedido -> Produtos -> Entregas
- Contrato -> Parcelas -> Documentos
- Cliente -> Atividades -> Histórico

## Formulários agrupados

Campos longos devem ser agrupados por sentido de negócio:

- Identificação;
- Evento/Faturamento;
- Equipe;
- Regras;
- Totais;
- Observações.

Prefira `form.groups` em vez de criar uma tela customizada apenas para organizar campos.

## Grids relacionados

Quando o usuário precisa operar filhos do registro principal, use `relatedGrid`.

Regras:

- Relação deve usar `foreignKey` + `parentKey`.
- Edição inline deve ser usada para ajustes rápidos de muitos itens.
- Ação por linha deve ser declarada como `rowActions`.
- A regra de negócio da ação fica no backend da Central.
- O Core deve executar e atualizar a interface.

## Regras

- Não recrie layout completo se o Core já renderiza.
- Não duplique chamada REST manual se o SDK do Core já atende.
- Não coloque regra de permissão apenas no frontend.
- Não hardcode endpoints quando a metadata puder fornecer.
- Não crie variações visuais fora do padrão sem necessidade real.
- Use overrides pequenos, específicos e documentados.
- Não crie página React customizada para resolver apenas: filtro, modal, abas, agrupamento de campos, grid relacionado ou ação por linha.

## Overrides

Overrides são permitidos para:

- campo especial;
- ação específica;
- card customizado;
- cabeçalho customizado;
- dashboard customizado;
- integração visual pontual;
- aba customizada dentro de `detailModal`.

Overrides não devem virar uma reimplementação do Core.

## Experiência padrão

A Central deve manter o padrão OonCore:

- navegação consistente;
- datagrids densos;
- formulários claros;
- feedback visual;
- status por badges;
- ações rastreáveis;
- responsividade;
- edição inline quando melhora a produtividade;
- detalhe em modal quando o registro possui relações operacionais.

## Contrato avançado implementado

Para telas mestre-detalhe, declare `detailModal` diretamente na coleção. A aba `form` salva o registro principal, `relatedGrid` busca filhos por `foreignKey=parent[parentKey]` e permite edição inline quando `editable: true` e `editMode: "inline"`, e `readonlyGrid` lista relações sem edição. Use `refresh` nas ações para coordenar recarga de `self`, `parent`, `all` ou abas específicas.

---

<!-- source: LOCAL_DEVELOPMENT.md -->

# Desenvolvimento local desconectado

## Início

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm install
npm run dev
```

O orquestrador inicia backend em `127.0.0.1:4000`, frontend em `127.0.0.1:5173`, gera códigos aleatórios e independentes para navegador e automação/seed, e abre o navegador. O Vite encaminha `/api` ao backend para manter cookies e CSRF na mesma origem.

O primeiro acesso troca o código de uso único por:

- cookie de sessão `HttpOnly`, `SameSite=Strict`;
- cookie CSRF de double-submit;
- sessão local cujo banco armazena somente hashes e expiração.

O prazo padrão é 30 dias. Reiniciar o processo rotaciona o segredo sem ampliar o prazo. Excluir o banco local cria um novo período; essa limitação é aceita na linha 0.5.

A decisão vem de `LocalExecutionPolicyProvider`. A fonte embarcada funciona offline e permite 30 dias. Uma fonte HTTP assinada poderá ser adicionada futuramente para novas emissões/renovações sem transformar a plataforma em dependência obrigatória.

## Perfis

O banner permite selecionar apenas papéis declarados em `central.app.json`. A permissão é recalculada no backend. Convites e usuários reais não são criados. Apps com tenant usam o contexto virtual fixo `local:tenant`, sem criar um tenant persistente ou aceitar um tenant arbitrário do cliente.

## Integrações

Use dublês ou credenciais explicitamente fornecidas no `.env` local do projeto. O Core não busca secrets da plataforma e não cria Deployment/binding/entitlement.

## Encerramento

`Ctrl+C` encerra os dois processos. Nunca use `--host 0.0.0.0`; conformance e startup devem reprovar essa configuração.

---

<!-- source: LOCAL_SECURITY_BOUNDARY.md -->

# Fronteira de segurança local

## Garantias

- bind real em loopback;
- Host e Origin limitados a `localhost`, `127.0.0.1` e `::1`;
- cabeçalhos de proxy recusados;
- códigos independentes de navegador e automação/seed, aleatórios, curtos e consumidos uma vez;
- segredo de sessão em cookie HttpOnly e somente hashes no banco;
- logout revoga a sessão no backend e invalida cookies anteriores;
- CSRF obrigatório nas mutações;
- nenhum bearer local no bundle ou `localStorage`;
- nenhuma identidade operacional ou chamada silenciosa à plataforma;
- `operationalRequestHeaders` falha com `LOCAL_OPERATION_NOT_SUPPORTED`;
- produção, Kubernetes e bind externo falham fechado.
- o contexto virtual `local:tenant` isola dados locais sem criar recurso na plataforma.

`Secure` é adicionado aos cookies quando `OON_LOCAL_HTTPS=true`; em HTTP loopback o cookie mantém `HttpOnly` e `SameSite=Strict`.

## Limitações explícitas

Quem controla código, banco e relógio locais pode reiniciar ou alterar o prazo. Os 30 dias são uma regra de experiência, não licenciamento inviolável. Uma política remota futura pode afetar novas emissões/renovações, mas não revoga imediatamente sessão offline já emitida.

O objetivo de segurança é impedir exposição da máquina/rede e impedir que identidade local escape para o Ecossistema.

---

<!-- source: METADATA_CRUD_UI.md -->

# Contrato ponta a ponta de metadata, CRUD e UI

1. `central.domain.json` ou `defineModel` registra model, campos, CRUD, roles e metadata.
2. O backend expõe `/core/metadata`, `/core/models` e o router CRUD do `basePath`.
3. Escopo de tenant/usuário, validação, fórmulas, referência, auditoria e triggers são aplicados no servidor.
4. O objeto code-first do App compõe coleções, formulários, filtros, relações, esteiras, documentos e dashboards.
5. O frontend consulta metadata e monta componentes do Core.

O CRUD padrão inclui listagem paginada, leitura, criação, atualização parcial, exclusão e import/export quando habilitados. Use rota customizada somente quando a operação não puder ser representada por CRUD, ação declarativa ou processo.

Campos calculados são exibidos reativamente no frontend e recalculados no backend. Campos de escopo são internos e imutáveis. Referências devem usar os filtros declarados; não faça consultas sem escopo.

---

<!-- source: OON_APP_AGENT_GUIDE.md -->

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

---

<!-- source: OONCORE_ARCHITECTURE.md -->

# Arquitetura OonCore

O OonCore é a base para criar Centrais operacionais sob demanda com arquitetura padronizada, segura e evolutiva.

A Central gerada não deve nascer como um sistema completo do zero. Ela deve nascer como uma camada de domínio que consome os recursos do Core.

## Separação de responsabilidades

```txt
Central
├── backend/   domínio, regras, validações, integrações e esteiras
└── frontend/  declaração de telas, coleções, documentos e overrides

OonCore Back
├── boot Express
├── Mongo/Mongoose
├── autenticação
├── RBAC
├── CRUD metadata-driven
├── auditoria
├── triggers/hooks
└── APIs padrão

OonCore Front
├── shell React
├── providers
├── roteamento
├── menu
├── datagrid
├── formulários
├── documentos
├── esteiras
└── SDK REST
```

## Modelo mini-monolítico

Cada Central começa como um mini-monolito de negócio: pequeno, coeso, isolado e capaz de entregar valor rapidamente. Quando uma parte do domínio se tornar reutilizável, crítica ou independente, ela pode evoluir para conector, serviço compartilhado ou micro-serviço.

## Fonte de verdade

- Dados e regras ficam no backend.
- Metadata operacional é exposta pelo backend.
- Frontend renderiza a experiência a partir da metadata.
- Permissões são decididas no backend.
- Integrações são tratadas como conectores, mappings, triggers e esteiras de integração.

## Objetivo dos Agents

O Agent deve acelerar a construção da Central usando a arquitetura existente. O objetivo não é gerar um app genérico, mas completar a camada de domínio com segurança e aderência ao Core.

---

<!-- source: PDF_RENDERING.md -->

# Renderização de PDF

Use esta capability para transformar HTML em um `Buffer` PDF sem conhecer endpoint, credencial ou implementação do serviço. Requer OonCore `0.6.0` ou superior.

## Declaração

Declare a dependência de infraestrutura em `oon.deploy.json`:

```json
{
  "capabilities": {
    "pdfRendering": {
      "required": true,
      "minVersion": "1.0.0"
    }
  }
}
```

Não adicione URL, usuário, senha ou implementation reference. O runtime resolve esses valores na publicação. Esta declaração não pertence ao array `capabilities` de `central.app.json`.

## API pública do backend

```js
const {
  capabilities,
  defineRoutes,
  GenericError,
  requirePermission,
} = require("@oondemand/oon-core-back");

defineRoutes("/pdf", (router) => {
  router.private.post(
    "/render",
    requirePermission("pdf.render"),
    async (req, res) => {
      if (typeof req.body?.html !== "string" || !req.body.html.trim()) {
        throw new GenericError("Informe o HTML.", {
          statusCode: 422,
          code: "PDF_HTML_REQUIRED",
        });
      }

      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", abort);

      try {
        const pdf = await capabilities.pdf.render(
          {
            html: req.body.html,
            format: req.body.format || "A4",
            printBackground: true,
          },
          {
            ...req.accessContext,
            correlationId: req.id,
            environment: process.env.APP_ENVIRONMENT,
            signal: controller.signal,
          },
        );

        res.type("application/pdf");
        res.set("Content-Disposition", 'attachment; filename="documento.pdf"');
        res.send(pdf);
      } finally {
        req.off("aborted", abort);
        res.off("close", abort);
      }
    },
  );
});
```

Declare `pdf.render` em `rbac.permissions` e conceda-a somente aos papéis necessários. O backend continua sendo a autoridade de permissão e tenant.

A assinatura é:

```ts
capabilities.pdf.render(input, context): Promise<Buffer>
```

| Campo de `input` | Tipo | Regra/default |
|---|---|---|
| `html` | string | obrigatório; máximo padrão de 2 MiB |
| `format` | `A3 \| A4 \| A5 \| Letter \| Legal` | `A4` |
| `landscape` | boolean | `false` |
| `marginTop`, `marginBottom`, `marginLeft`, `marginRight` | number | polegadas, de 0 a 4; `0.39` |
| `printBackground` | boolean | `true` |
| `timeoutMs` | number | mínimo 1.000 ms; padrão 30.000 ms; máximo do runtime, padrão 60.000 ms |

O `context` pode carregar `tenantId`, `appCode`, `environment`, `operationId`, `correlationId`/`requestId`, `signal` e, somente em testes, `fetchImpl`. A saída deve começar com `%PDF-` e tem limite padrão de 20 MiB.

## Preview e download no frontend

Preview do HTML deve usar iframe sem privilégios:

```tsx
<iframe title="Prévia" sandbox="" srcDoc={html} />
```

Para gerar e baixar usando o cliente autenticado do Core:

```tsx
import { useOonApi } from "@oondemand/oon-core-front";

function DownloadPdfButton({ html }: { html: string }) {
  const { http } = useOonApi();

  async function download() {
    const response = await http.post(
      "/pdf/render",
      { html, format: "A4" },
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "documento.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <button onClick={download}>Gerar PDF</button>;
}
```

Nunca envie a geração diretamente a um endpoint de infraestrutura pelo navegador.

## Erros

`PdfRenderingError` expõe `code`, `statusCode`, `retryable` e detalhes sanitizados.

| Código | Retry | Significado |
|---|---:|---|
| `PDF_RENDERING_INVALID_INPUT` | não | HTML vazio ou acima do limite |
| `PDF_RENDERING_INVALID_OPTIONS` | não | formato, margem ou opção inválida |
| `PDF_RENDERING_UNAVAILABLE` | sim | capability não resolvida no ambiente |
| `PDF_RENDERING_CREDENTIAL_UNAVAILABLE` | sim | credencial interna não injetada |
| `PDF_RENDERING_IMPLEMENTATION_ERROR` | sim | implementação respondeu com falha |
| `PDF_RENDERING_TIMEOUT` | sim | prazo excedido ou sinal abortado |
| `PDF_RENDERING_SATURATED` | sim | concorrência/fila excedida |
| `PDF_RENDERING_TRANSPORT_ERROR` | sim | falha transitória de transporte |
| `PDF_RENDERING_INVALID_OUTPUT` | sim | saída inválida ou acima do limite |

Use retentativas apenas quando `error.retryable === true`, com backoff e idempotência na operação chamadora.

## Segurança e runtime local

- trate HTML do usuário como não confiável; sanitize no App e use interpolação escapada;
- prefira HTML autocontido; recursos remotos tornam o resultado não determinístico e podem ser bloqueados;
- nunca inclua segredos, tokens ou credenciais no HTML;
- não registre HTML nem bytes do PDF; registre correlação, duração, tamanhos e código de erro;
- propague cancelamento do request por `AbortSignal`;
- no runtime local, a capability falha fechado com `PDF_RENDERING_UNAVAILABLE` quando não resolvida;
- em testes automatizados, um transport fake pode ser injetado por `capabilities.configurePdfRendering` e deve devolver bytes iniciados por `%PDF-`; não gere um “PDF” textual falso no código do App.

---

<!-- source: PORTAL_COCKPIT_PATTERNS.md -->

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

---

<!-- source: RBAC_SECURITY.md -->

# RBAC e Segurança

A segurança da Central deve ser aplicada no backend. O frontend pode ocultar ou exibir ações, mas não é a fonte de decisão.

## Regras obrigatórias

- Toda operação sensível deve validar usuário autenticado.
- Toda alteração de dados deve validar permissão.
- Toda ação de integração deve validar permissão e contexto.
- Nunca confiar em `tenantId`, `appId`, `perfil` ou `roles` enviados livremente pelo frontend.
- Segredos devem vir de variáveis de ambiente ou vault equivalente.
- Logs não devem expor tokens, senhas, app keys ou dados sensíveis desnecessários.

## RBAC

Use o RBAC do Core para:

- controlar acesso por app;
- controlar perfis;
- controlar ações;
- filtrar funcionalidades;
- proteger rotas;
- permitir evolução de permissões sem reconstruir telas.

## Catálogo canônico de perfis

```http
GET /core/role-catalog
```

Resposta:

```json
{
  "schemaVersion": 1,
  "appCode": "central-compras",
  "enabled": true,
  "roles": [
    {
      "code": "viewer",
      "name": "Consulta",
      "description": "Somente leitura.",
      "admin": false
    }
  ]
}
```

Use esse endpoint para montar seletores e validar grants por App. Não mantenha códigos de perfil paralelos no frontend ou no Control Plane. O consumidor deve validar versão e App, bloquear redirects e destinos de rede privados, revalidar o perfil no backend e tratar catálogo inválido como indisponível. O endpoint usa cache público de cinco minutos e nunca expõe a lista de permissões; a autorização efetiva continua no App.

## Checklist de segurança para Agents

Antes de concluir uma alteração, confirme:

- Existe validação de entrada?
- Existe validação de permissão no backend?
- Existe tratamento de erro?
- A operação gera rastreabilidade?
- Algum segredo foi colocado no código?
- Algum dado sensível foi exposto no frontend?
- O comportamento funciona para múltiplos usuários e múltiplos apps?

---

<!-- source: REACTIVE_DOMAIN_FORMULAS.md -->

# Fórmulas reativas nos formulários OonCore

A partir do contrato declarativo de domínio, campos com `computed` são recalculados imediatamente nos formulários padrão do `@oondemand/oon-core-front`.

O App não precisa repetir a fórmula no frontend nem criar componentes React específicos. A declaração continua existindo uma única vez no `central.domain.json` do backend.

## Fluxo

1. O backend carrega e valida o `central.domain.json`.
2. A metadata da model expõe `readonly` e `computed`.
3. O frontend interpreta a mesma AST fechada para apresentar uma prévia imediata.
4. Campos calculados e readonly são removidos do payload enviado pelo formulário.
5. O backend recalcula novamente, executa as validações e persiste o valor autoritativo.
6. Depois da resposta, o formulário passa a exibir o registro devolvido pelo servidor.

> O cálculo no navegador melhora a experiência do usuário. Ele nunca substitui o cálculo, a proteção readonly ou a validação do backend.

## Formulários atendidos

- formulário dinâmico de coleções (`DynamicForm`);
- formulário principal em modal com abas (`CoreTabbedDetail`);
- criação e edição;
- formulários derivados integralmente da metadata;
- formulários com apresentação local, desde que a model continue sendo carregada pela metadata do Core.

## Exemplo

A declaração permanece somente no domínio:

```json
{
  "subtotal": {
    "kind": "currency",
    "computed": {
      "precision": 2,
      "expression": {
        "op": "multiply",
        "args": [
          { "field": "quantidade" },
          { "field": "diarias" },
          { "field": "valorUnitario" }
        ]
      }
    }
  }
}
```

Ao alterar quantidade, diárias ou valor unitário, o campo subtotal é atualizado na tela. Ao salvar, subtotal não é enviado pelo cliente: o backend calcula novamente e devolve o valor persistido.

## Paridade da AST

O frontend suporta o mesmo vocabulário do backend:

- aritméticos: `add`, `subtract`, `multiply`, `divide`, `min`, `max`, `abs`, `negate`, `coalesce`;
- comparação: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`;
- lógicos e presença: `and`, `or`, `not`, `present`, `in`;
- nós de valor: `{ "value": ... }`;
- referências: `{ "field": "nomeDoCampo" }`.

Os testes de caracterização usam cadeias financeiras equivalentes às do backend para reduzir o risco de divergência sem permitir execução de JavaScript arbitrário no navegador.

## Tratamento de erros

Erros de prévia, como divisão por zero ou valor não numérico, aparecem associados ao campo calculado. O usuário pode corrigir as entradas imediatamente.

A decisão final continua no backend, que retorna `DomainRuleError` com status 422 quando a mutação viola o contrato.

## Extensões locais

Não crie funções de cálculo em componentes da Central para campos já descritos por `computed`.

Use código local apenas quando a regra:

- não puder ser representada pela AST;
- depender de consulta externa;
- exigir agregação de registros relacionados;
- ainda não possuir contrato declarativo no OonCore.

Nesses casos, mantenha o backend como fonte de verdade e registre a lacuna para evolução do Core.

---

<!-- source: releases/0.3.41.md -->

# OonCore 0.3.41 — Manifesto declarativo de domínio

Versão destinada à homologação do primeiro contrato declarativo completo de domínio no backend.

## Recursos incluídos

- carregamento automático de `central.domain.json`;
- declaração versionada de models e campos;
- validação estrutural agregada;
- fórmulas declarativas sem execução de JavaScript arbitrário;
- campos calculados no servidor;
- ordenação de dependências e detecção de ciclos;
- proteção de campos `readonly` em criação, atualização e importação;
- validações declarativas entre campos;
- atualização parcial com consolidação e recálculo;
- compatibilidade com `defineValidation` durante a migração gradual.

## Objetivo da homologação

Validar o contrato em uma Central de teste antes da conversão dos models e regras da SS-Eventos.

A homologação deve confirmar:

1. criação e carregamento do manifesto;
2. geração de metadata e CRUD;
3. recálculo de campos em `POST`, `PUT` e `PATCH`;
4. rejeição de adulteração em campos controlados pelo servidor;
5. mensagens de validação associadas ao campo correto;
6. compatibilidade com models e validações JavaScript ainda não migrados.

## Fora do escopo

- fórmulas reativas no frontend;
- índices compostos;
- triggers e transições declarativas;
- engine genérica de integrações;
- migração da SS-Eventos.

---

<!-- source: releases/0.5.0.md -->

# OonCore 0.5.0

## Mudança principal

Runtime de desenvolvimento local desconectado, com sessão automática por até 30 dias, loopback obrigatório e documentação canônica distribuída para IA/Agents.

## Migração obrigatória

- alinhar back, front e create-central em `0.5.x`;
- usar `OON_RUNTIME_MODE=local` apenas com `NODE_ENV=development`;
- remover `DEV_TOKEN`, `VITE_DEV_TOKEN` e o valor `dev-local`;
- usar Vite em `127.0.0.1` com proxy `/api`;
- sincronizar `.ooncore/` e preservar o `AGENTS.md` raiz;
- usar o código dedicado de automação para seed, preservando o bootstrap do navegador;
- atualizar compatibilidade do App para `>=0.5.0 <0.6.0` após homologação.

## Segurança

Local não emite nem reutiliza identidade operacional. Rotas de plataforma são bloqueadas; cookies/CSRF substituem bearer local. Apps com tenant usam apenas `local:tenant`. Reiniciar processos não renova uma sessão expirada; reset do banco reinicia o prazo e permanece uma limitação conhecida.

O manifesto documental inclui hash dos documentos e dos entrypoints gerados (`AGENTS.md`, `CODEX.md` e `context.generated.md`).

## Compatibilidade

`DEV_TOKEN` explícito permanece temporariamente apenas para testes/CI legados fora de `OON_RUNTIME_MODE=local`; novos scaffolds não o geram.

---

<!-- source: releases/0.6.0.md -->

# OonCore 0.6.0

A linha 0.6 substitui o bootstrap orientado a manifesto por uma API pública code-first, preservando a governança da Plataforma Oon.

## Destaques

- bootstrap com `defineOonApp` e `startOonApp`;
- rotas, menus, páginas, componentes e temas tipados;
- scaffold único e neutro em `_base`;
- `central.app.json` schema v2;
- remoção integral dos templates selecionáveis, Omie e provider genérico de integrações;
- resolução de capabilities técnicas pela Plataforma Oon, sem expor detalhes de implementação aos Apps;
- documentação distribuída atualizada para desenvolvimento assistido por Agents.

## Upgrade

- alinhe `@oondemand/oon-core-back`, `@oondemand/oon-core-front` e `@oondemand/create-central-oon` na linha `0.6.x`;
- declare compatibilidade `>=0.6.0 <0.7.0`;
- migre o frontend para `defineOonApp`/`startOonApp`;
- remova flags e módulos legados;
- execute docs check, conformance, typecheck, testes e smoke offline antes da publicação.

A versão 0.6 é incompatível com os contratos removidos da linha 0.5.

---

<!-- source: ROUTES_HOOKS_WORKERS.md -->

# Rotas, hooks, triggers e workers

- `defineRoutes(basePath, router)`: registra rota específica do domínio. Proteja com auth já montada, `requirePermission`, validação e `req.accessContext`.
- `defineValidation(model, fn)`: valida o estado consolidado antes de persistir.
- `defineTrigger(model, fn)`: efeito de domínio rastreável associado à mutação.
- Process manifest: transições, bindings, invariantes, recálculos e jobs transacionais.
- Integration runtime: outbox/inbox, retry, lock, idempotência, histórico e webhook.

Não crie processo web paralelo, registry local, timer genérico ou worker que replique o Core. Jobs devem ser idempotentes, limitar retry, sanitizar payload/erro e encerrar com o lifecycle do processo.

No runtime local, workers e filas podem operar contra Mongo local, mas operações que exigem identidade da plataforma devem retornar `LOCAL_OPERATION_NOT_SUPPORTED`.

---

<!-- source: RUNTIME_MODES.md -->

# Modos de runtime

| Contrato | `local` | `platform` |
|---|---|---|
| Configuração | `NODE_ENV=development`, `OON_RUNTIME_MODE=local` | ambiente publicado |
| Bind | somente loopback | contrato da infraestrutura |
| Identidade | principal técnico local | usuário/tenant/Deployment reais |
| Ativação | `ativa_local` | estados da plataforma |
| Sessão | cookie HttpOnly, TTL de até 30 dias | auth/SSO configurado |
| RBAC | simula somente papéis do manifesto | acessos reais |
| Plataforma | nenhuma chamada obrigatória | conforme capability |
| Publicar/promover | bloqueado | por contratos autorizados |

`local` não é o ambiente publicado `desenvolvimento`. Ele não possui `deploymentId`, `instanceId`, `bindingId`, `entitlementId`, licença ou credencial operacional.

O Core falha no startup local quando encontra produção, Kubernetes, identidade operacional, bind não-loopback ou `PUBLIC_APP_URL` externa.

---

<!-- source: TESTING_CONFORMANCE.md -->

# Testes e conformidade

## Gates do projeto consumidor

```bash
npm run ooncore:docs:check
npm run ooncore:conformance
npm run check
npm test
```

## Runtime local

Comprove:

- `127.0.0.1` e `localhost` funcionam;
- `0.0.0.0`, IP de LAN, Host/Origin externos e proxy falham;
- nenhuma chamada alcança a plataforma;
- cookies existem e bearer não aparece no `localStorage`;
- bootstraps de navegador e automação não podem ser reutilizados nem invalidar um ao outro;
- expiração bloqueia a sessão e reiniciar o processo não amplia o prazo;
- Apps multi-tenant recebem somente o contexto virtual fixo `local:tenant`;
- perfis fora do manifesto falham;
- CRUD, metadata, dashboards, processos e integrações locais funcionam;
- `operationalRequestHeaders` falha fechado;
- apagar o Mongo local inicia novo prazo, como limitação documentada.

## Documentação

`docs --check` valida fonte, versão, schema, entrada `AGENTS.md`, hashes dos documentos e entrypoints, além da presença de todos os arquivos. O tarball npm deve conter docs, templates e schemas. Exemplos devem compilar ou executar em CI.

---

<!-- source: TRANSACTIONAL_EMAIL.md -->

# E-mail transacional

A capability `core.transactional-email` fornece configuração protegida, templates versionados, preview, envio idempotente, fila, retentativas e painel administrativo. Requer OonCore `0.6.0` ou superior.

## Declaração funcional

Em `central.app.json`:

```json
{
  "capabilities": ["core.transactional-email"],
  "capabilitySettings": {
    "core.transactional-email": {
      "enabled": true,
      "scopePolicy": "tenant_override",
      "retentionDays": 30,
      "attachmentsPolicy": { "allowed": false },
      "templates": [
        {
          "code": "confirmacao",
          "definition": "./emails/confirmacao.json",
          "initialStatus": "active"
        }
      ]
    }
  }
}
```

`scopePolicy` aceita `app_only`, `tenant_required` ou `tenant_override`. `retentionDays` aceita 1 a 90. Nesta linha do Core, anexos não são permitidos.

A definição referenciada contém:

```json
{
  "code": "confirmacao",
  "name": "Confirmação",
  "subject": "Olá, {{nome}}",
  "htmlContent": "<p>Olá, {{nome}}.</p>",
  "textContent": "Olá, {{nome}}.",
  "variablesSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["nome"],
    "properties": { "nome": { "type": "string" } }
  },
  "locale": "pt-BR",
  "initialStatus": "active",
  "attachmentsPolicy": { "allowed": false }
}
```

Templates usam somente interpolação Handlebars escapada. Blocos, helpers, subexpressões, triple-stache e conteúdo remoto executável não são aceitos.

## Envio no backend

```js
const { capabilities } = require("@oondemand/oon-core-back");

async function enviarConfirmacao({ email, nome, idempotencyKey }, req) {
  return capabilities.transactionalEmail.send(
    {
      templateCode: "confirmacao",
      to: email,
      variables: { nome },
      idempotencyKey,
      correlationId: req.id,
      maxAttempts: 5,
    },
    {
      ...req.accessContext,
      userId: req.accessContext?.userId,
    },
  );
}
```

`idempotencyKey` é obrigatória. O retorno é `{ dispatchId, status, correlationId }`; `status` é `accepted` ou `duplicate`. Não trate `accepted` como entrega confirmada.

Outras operações públicas do namespace `capabilities.transactionalEmail` incluem preview e versionamento de templates, consulta de dispatches e retry de dead letter. Para administração interativa, prefira o componente do Core.

## Painel administrativo

```tsx
import { CoreTransactionalEmail } from "@oondemand/oon-core-front";

export function EmailPage() {
  return <CoreTransactionalEmail />;
}
```

Proteja a rota e declare/conceda apenas as permissões necessárias:

- `transactional-email.config.read`
- `transactional-email.config.manage`
- `transactional-email.templates.read`
- `transactional-email.templates.manage`
- `transactional-email.dispatches.read`
- `transactional-email.dispatches.retry`

O componente usa as rotas autenticadas em `/core/transactional-email/*`. Credenciais são inseridas pela tela protegida e armazenadas pelo Core; nunca as coloque no manifesto, frontend, repositório ou log.

## Segurança e operação

- o backend resolve app e tenant a partir do contexto validado;
- `tenant_required` exige tenant; `tenant_override` usa configuração do tenant quando houver e recua para a do App;
- destinatários e variáveis são validados antes de enfileirar;
- payload protegido tem retenção limitada; listagens não retornam o payload protegido;
- erros usam `TransactionalEmailError` e códigos `EMAIL_*` sanitizados;
- no runtime local, falhe fechado até a capability e seu secret store/configuração estarem disponíveis;
- testes devem substituir a fronteira externa; não envie e-mail real e não grave credenciais de teste.

---

<!-- source: TROUBLESHOOTING.md -->

# Troubleshooting

| Sintoma | Verificação | Correção |
|---|---|---|
| `LOCAL_RUNTIME_ENV_INVALID` | `NODE_ENV` | use `development` |
| bind proibido | `HOST`, Vite `server.host` | use `127.0.0.1` |
| bootstrap inválido | URL antiga/reutilizada | reinicie `npm run dev` e use a nova URL |
| 401 local | cookie apagado/expirado | abra a URL de bootstrap atual |
| `LOCAL_SESSION_EXPIRED` no startup | prazo local de 30 dias encerrado | exclua os dados locais para iniciar o período aceito na linha 0.5 |
| seed invalida o navegador | código incorreto usado no script | use exclusivamente o código **Automação/seed** |
| 403 CSRF | frontend não está na mesma origem/proxy | use `/api` pelo proxy Vite |
| docs desatualizados | versão/hash | `npm run ooncore:docs` |
| perfil ausente | `central.app.json.rbac.roles` | declare o papel e sincronize/reinicie |
| operação de plataforma bloqueada | código `LOCAL_OPERATION_NOT_SUPPORTED` | use dublê/credencial local ou homologue publicado |
| Mongo indisponível | `MONGO_URI`, replica set quando exigido | inicie Mongo local conforme o projeto |
| porta ocupada | 4000/5173 | encerre processo conflitante; não exponha outra interface |

Nunca resolva erro local adicionando token fixo, `0.0.0.0`, proxy externo ou credencial de Deployment.
