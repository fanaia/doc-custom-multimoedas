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
