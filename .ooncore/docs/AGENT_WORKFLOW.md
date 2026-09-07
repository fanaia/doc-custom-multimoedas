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
