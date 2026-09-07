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
