# Troubleshooting

| Sintoma | Verificação | Correção |
|---|---|---|
| `LOCAL_RUNTIME_ENV_INVALID` | `NODE_ENV` | use `development` |
| bind proibido | `HOST`, Vite `server.host` | use `127.0.0.1` |
| bootstrap inválido | URL antiga/reutilizada | reinicie `npm run dev` e use a nova URL |
| 401 local | cookie apagado/expirado | abra a URL de bootstrap atual |
| `LOCAL_SESSION_EXPIRED` no startup | prazo local de 30 dias encerrado | exclua os dados locais para iniciar o período aceito na linha 0.5 |
| seed invalida o navegador | código incorreto usado no script | use exclusivamente o código **Automação/seed** |
| 403 CSRF | frontend não está na mesma origem/proxy | use `/api` pelo proxy Vite |
| docs desatualizados | versão/hash | `npm run ooncore:docs` |
| perfil ausente | `central.app.json.rbac.roles` | declare o papel e sincronize/reinicie |
| operação de plataforma bloqueada | código `LOCAL_OPERATION_NOT_SUPPORTED` | use dublê/credencial local ou homologue publicado |
| Mongo indisponível | `MONGO_URI`, replica set quando exigido | inicie Mongo local conforme o projeto |
| porta ocupada | 4000/5173 | encerre processo conflitante; não exponha outra interface |

Nunca resolva erro local adicionando token fixo, `0.0.0.0`, proxy externo ou credencial de Deployment.
