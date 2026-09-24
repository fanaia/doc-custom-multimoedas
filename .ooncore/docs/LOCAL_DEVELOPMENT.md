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
