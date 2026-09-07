# Autenticação, ativação e RBAC

## Plataforma

O backend verifica o token no escopo do App, resolve tenant e acesso, aplica a política local de RBAC e cria `req.accessContext`. O frontend usa permissões somente para experiência; o backend autoriza cada operação.

Ativação de plataforma cria a identidade operacional usada por integrações autorizadas. Rotas de login, launch exchange, ativação e primeiro acesso não estão disponíveis no runtime local.

## Catálogo público de perfis

Todo App com RBAC declarado expõe `GET /core/role-catalog`. O contrato `schemaVersion: 1` contém apenas `appCode`, `enabled` e `roles[]` com `code`, `name`, `description` e `admin`. Permissões internas não são expostas.

O catálogo serve para descoberta e seleção de perfis pelo Control Plane. Ele não concede acesso: o backend consumidor deve validar `schemaVersion` e `appCode`, consultar somente o Deployment resolvido pela plataforma, revalidar o perfil antes de persistir o grant e falhar fechado quando o catálogo estiver ausente ou inválido.

## Local

O principal técnico é `local:developer`, sem usuário/tenant/licença na plataforma. O papel inicial é `developer` quando declarado, seguido por admin ou primeiro papel. A troca de perfil aceita apenas o manifesto e atualiza a sessão local.

O estado é `ativa_local`; o `ActivationGuard` não cria nem consulta `InstanciaEcossistema`. Isso não equivale a `ativa` publicada.

## Regras para extensões

- use `requirePermission` em rotas customizadas;
- derive filtros de `req.accessContext`;
- nunca autorize por header/body de perfil ou tenant;
- não implemente `verifyToken` em Central member/portal;
- não persista bearer no frontend;
- não trate simulação local como identidade operacional.


## Apps globais e tenant-alvo

Apps com `tenancyModel=none` não montam `TenantProvider`, não restauram tenant
do storage e não consomem o parâmetro reservado `tenant`. Cockpits globais
devem transportar a organização administrada com um identificador próprio,
como `targetTenantId`, e o BFF deve convertê-lo no header específico do
contrato administrativo. Esse alvo nunca integra a sessão do App.
