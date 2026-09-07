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
