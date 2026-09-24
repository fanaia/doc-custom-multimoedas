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
