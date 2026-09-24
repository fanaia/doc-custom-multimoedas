# Empacotamento e validação da imagem do Oon-App

O contrato abaixo descreve o builder governado de delivery do OonCore. Estar no
checkout ou no contexto Docker **não** significa estar na imagem final.

| Origem | Destino/efeito | Contrato |
|---|---|---|
| `backend/` | `/app/backend/` | Código, manifests e assets de runtime; preserva caminhos relativos |
| `backend/package*.json` | instalação no estágio backend | Somente dependências de produção (`--omit=dev`) |
| `frontend/` | compilação no estágio frontend | `npm run build`; fontes não são copiadas para o runtime |
| `frontend/dist/` produzido no build | `/usr/share/nginx/html/` | Artefatos estáticos compilados |
| `central.app.json` | `/app/central.app.json` e `/src/central.app.json` no build frontend | Quando existente |
| Definições em `capabilitySettings["core.transactional-email"].templates[].definition` | Mesmo caminho relativo a `/app` | Somente arquivos declarados, dentro da raiz; traversal/symlink externo rejeitado |
| `docs/`, `.ooncore/`, arquivos da raiz e demais diretórios | Sem cópia genérica para o runtime | Não usar como origem de imports necessários em produção |
| `node_modules`, `.git`, `.env*`, `.npmrc`, `*.pem`, `*.key` | Excluídos pelo builder | A instalação local não pode sobrescrever dependências de produção |
| `frontend/.env.production` | Entrada do build frontend | Única exceção `.env`; gerada pelo executor, sem segredos |
| Testes dentro de `backend/` | Podem ser copiados como qualquer arquivo backend | Não são executados no runtime; não colocar segredos em fixtures |

O `.dockerignore` do App é preservado e acrescido de exclusões obrigatórias em
`.oon-delivery/Dockerfile.dockerignore`. Ele pode restringir ainda mais o contexto,
mas não reintroduzir dependências locais ou arquivos excluídos por essas regras.
As extensões listadas não identificam todos os segredos possíveis: nunca versione
credenciais. Assets adicionais não têm um mecanismo de cópia genérica.

## Assets e dependências

Para catálogos usados por `backend/src/services/omie-contracts.js`, use por exemplo:

```text
backend/src/assets/omie/catalog.json
backend/src/assets/omie/conversion-catalog.json
```

```js
const catalog = require('../assets/omie/catalog.json');
const conversions = require('../assets/omie/conversion-catalog.json');
```

O import `require('../../../docs/omie/catalog.json')` depende de um diretório da
raiz que não está na imagem; o resultado esperado é `IMAGE_MODULE_NOT_FOUND`.
Declare pacotes exigidos em runtime em `backend/package.json#dependencies`, não
apenas em `devDependencies` nem apenas no package da raiz.

## Carregamento não é cópia

O bootstrap carrega `central.config.js`, manifests declarativos do backend e os
arquivos `.js`/`.cjs` recursivos de `src/models`, `src/validations`, `src/triggers`,
`src/routes`, `src/pipelines`, `src/documents` e `src/hooks`. Outros diretórios,
como `src/services` e `src/assets`, entram por imports desses módulos; não são
autocarregados só por existirem. Não mantenha scripts executáveis de teste nos
diretórios de autocarregamento.

## Testes e imagem final

Se existe `scripts.test` na raiz, ele é o ponto de entrada da suíte e deve
orquestrar os componentes. Sem esse script, o executor roda os testes declarados
em backend e frontend. Não há inferência por texto de comando. Relatórios
registram `not_declared`, `root_orchestrated`, `not_run`, `passed` ou `failed`;
nenhum teste declarado não equivale a uma suíte aprovada.

Os testes usam dependências instaladas sem lifecycle scripts, em contêiner sem
credenciais e sem rede durante a execução. Testes que exigem serviços externos ou
scripts de instalação precisam ser compatibilizados com esse contrato; uma falha
nessa etapa não é automaticamente classificada como defeito da aplicação.

Após o build, a **mesma imagem**, identificada por ID `sha256`, é iniciada com o
entrypoint normal, usuário não privilegiado, filesystem de leitura, diretórios
temporários limitados, limites de CPU/memória/processos e timeout. MongoDB é
descartável. Ambos compartilham apenas loopback, sem acesso à rede externa,
credenciais reais, socket Docker ou mounts do host. Não há bypass de imports,
ativação ou permissões. Readiness deve passar em três observações consecutivas.

A morte do backend ou Nginx encerra o contêiner. Liveness consulta o backend sem
exigir banco saudável; readiness conserva os requisitos de banco. Perda
transitória do banco não deve provocar reinício só pela liveness.

Falha impede exportação da imagem para deploy; o executor não faz push,
provisionamento nem apply. O Workspace recebe etapa, categoria, código, caminho e
importador quando disponíveis e orientação. `502`/timeout isolados não comprovam
erro de código. O relatório não contém logs ou stack brutos.

Essa prova cobre carregamento e inicialização na configuração isolada. Não
substitui testes funcionais, autenticação/tenancy, integrações reais, imports
preguiçosos acionados somente por requisições nem a homologação Dev → HML → Prod.
