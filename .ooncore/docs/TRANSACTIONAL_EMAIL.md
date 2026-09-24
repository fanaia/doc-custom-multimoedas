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
