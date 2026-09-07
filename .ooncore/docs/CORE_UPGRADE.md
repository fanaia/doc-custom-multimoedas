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
