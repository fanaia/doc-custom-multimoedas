# Doc Custom Multimoedas

Central Oon multi-tenant e multi-base para gerar, aprovar, anexar e enviar faturas personalizadas de Ordens de Serviço (OS) do Omie.

## Fluxo

1. O webhook opaco identifica a base e aceita somente eventos de OS na etapa configurada.
2. O aprovador autoriza o processamento.
3. A Central consulta OS/cliente, resolve características e moedas, renderiza o EJS isolado e gera o PDF.
4. O aprovador confere e aprova ou rejeita a fatura.
5. A Central anexa o PDF à OS com chave determinística.
6. O operador confirma destinatários/anexos e envia o e-mail.
7. A Central preserva as observações, atualiza a etapa Omie e conclui o processo.

Falhas ficam na etapa `Falha`, com etapa de origem, tentativa, duração e erro sanitizado. A retentativa continua do ponto registrado e consulta os marcadores de PDF, anexo, e-mail e atualização Omie antes de repetir um efeito.

## Arquitetura e isolamento

- Todas as 12 models de negócio do Doc Custom usam `scope: tenant`, campo `tenantId` oculto e filtros tenant-scoped. A model `Pessoa`, fornecida pelo scaffold, também usa escopo tenant e possui teste de isolamento próprio.
- Bases Omie, configurações, moedas, histórico, templates, imagens, gatilhos, processos, PDFs e eventos são isolados.
- App Key, App Secret e token de webhook usam AES-256-GCM em repouso; só a máscara da App Key aparece na metadata/CRUD.
- O webhook resolve a base por hash de token aleatório e ainda valida a App Key recebida.
- O frontend é integralmente declarativo: home, painel, cadastros, filtros, esteira, detalhe, ações condicionais e auditoria são definidos em `frontend/central.ui.json`.
- Shell, autenticação, RBAC, CRUD, metadata e auditoria HTTP continuam pertencendo ao OonCore.

Os módulos nativos `integrations` e `omie` permanecem desabilitados no OonCore 0.4.5 porque seus modelos/rotas técnicos não têm isolamento por tenant em deployment compartilhado. A integração de OS desta Central usa models e rotas tenant-scoped próprios. O gap do Core está rastreado em [oondemand/oon-platform#106](https://github.com/oondemand/oon-platform/issues/106).

## Configuração local

```bash
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Configure no backend:

- `MONGO_URI`;
- `DEV_TOKEN` e `DEV_TENANT_ID` para desenvolvimento;
- `DOC_CUSTOM_CREDENTIALS_ENCRYPTION_KEY` com pelo menos 32 caracteres;
- `PUBLIC_APP_URL` para formar URLs de webhook;
- `SENDGRID_API_KEY`;
- `PDF_RENDERER_URL` e, se necessário, `PDF_RENDERER_TOKEN`.

O fallback PDF textual existe para desenvolvimento. Em produção, use `PDF_REQUIRE_RENDERER=true` para exigir um renderer HTML/CSS real.

```bash
npm run dev:backend
npm run dev:frontend
```

## Preparação de um tenant

1. Crie uma `BaseOmie` inativa pelo CRUD declarativo.
2. Grave as credenciais pela rota segura (elas não fazem parte do CRUD comum):

```bash
curl -X PUT "$API/api/doc-custom/bases/$BASE_ID/credenciais" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H "Content-Type: application/json" \
  -d '{"appKey":"...","appSecret":"..."}'
```

3. Teste a conexão, ative a base e sincronize as etapas de Venda de Serviço.
4. Consulte ou rotacione o webhook. O token completo só é retornado nessas ações autorizadas.
5. Cadastre configurações globais e, quando necessário, valores específicos da base. A precedência é base sobre global.
6. Cadastre moedas fixas ou Bacen/PTAX. Uma moeda Bacen sem histórico só pode ser ativada com contingência positiva.
7. Importe o template de documento obrigatório da issue:

```bash
curl -X POST "$API/api/doc-custom/templates/obrigatorio/importar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID"
```

O conteúdo EJS versionado fica em `backend/src/templates/invoice-os-v1.html`. Cadastre também templates ativos dos tipos `assunto` e `corpo-email`, uma imagem ativa de código `logo`, o gatilho e seu mapeamento de etapas por base.

8. Use `POST /api/doc-custom/gatilhos/:id/preview` com `baseOmieId` e `numeroOs` para validar HTML, PDF, assunto e corpo com o mesmo montador usado no processo real.

Configure a API Key e o remetente do SendGrid em **Configurações > Integrações**. A chave é criptografada por tenant e nunca volta para o frontend; `email-from` e `email-from-nome` podem sobrescrever o remetente padrão, enquanto `email-cc`, `email-copia` e `email-bcc` complementam os destinatários. O template obrigatório também usa `endereco-linha1`, `endereco-linha2`, `cidade`, `razao-social`, `pagamento-banco`, `pagamento-agencia`, `pagamento-cc`, `pagamento-swift` e `pagamento-iban`.

Cada Base Omie expõe uma URL no formato `/api/doc-custom/webhooks/omie/:token`. Cadastre essa URL no tópico **Ordem de Serviço alterada** (`OrdemServico.Alterada`); o token opaco resolve a base e seu tenant. O backend também registra o alias `/doc-custom/webhooks/omie/:token`, usado após a remoção do prefixo `/api` pelo ingress, e responde ao POST do Omie sem expor uma rota sem token. Inclusão, exclusão e faturamento não precisam ser cadastrados porque não iniciam a esteira. Todas as chamadas Omie e SendGrid são registradas em **Auditoria > Tickets de Integração**, sem credenciais ou conteúdos Base64.

## Moedas e fallback

Para moedas PTAX a ordem é obrigatória:

1. fechamento obtido na execução;
2. última cotação Bacen persistida do tenant/moeda;
3. valor de contingência configurado.

A fonte, referência, horário de consulta e alerta de fallback são persistidos na execução e no histórico. Zero, um implícito e valores não positivos são rejeitados.

## Segurança do EJS

O renderer executa em um contexto `vm` sem geração dinâmica de código e bloqueia `process`, `require`, módulos, globais, filesystem, rede, protótipos e construtores. Tempo e tamanho de saída são limitados. As variáveis são serializadas antes da execução, portanto não recebem objetos internos, credenciais ou métodos da aplicação.

O contrato exposto contém somente `os`, `cliente`, metadados de `baseOmie`, `moedas`, `configuracoes` resolvidas e `includes` validados em Base64.

## Verificação

```bash
npm run check
```

O gate valida documentação OonCore, conformidade arquitetural, 18 testes de backend e o build de produção do frontend. Os testes cobrem o EJS obrigatório, isolamento das models, criptografia, webhook canônico, PTAX/histórico/contingência, anexos, limites pré-envio, PDF, ZIP Omie, destinatários e sanitização.

Comandos individuais:

```bash
npm run ooncore:docs:check
npm run ooncore:conformance
npm test --prefix backend
npm run build --prefix frontend
```

O cache `.ooncore/` é regenerável e não deve ser editado manualmente.
