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
