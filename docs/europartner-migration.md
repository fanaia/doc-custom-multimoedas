# Europartner Faturas — E1/E2 da issue oondemand/oon-platform#170

O App mantém identidade `doc-custom-multimoedas`, passa a se apresentar como Europartner
Faturas e declara `single_tenant` / `dedicated`, Core 0.6.6 fixo nos três pacotes e
documentação `.ooncore` regenerada pelo gerador. O bootstrap usa `defineOonApp`/
`startOonApp` e runtime local sem token de desenvolvimento. Isso não altera sozinho
Deployments ou bindings já publicados: o destino dedicado exige validação na Central.

## Características tipadas

`EuropartnerSettings` contém emissor/endereço, dados bancários, remetente/cópias internas
e flags de automação. Um registro padrão por tenant e um por base; índice único e
referência de base validada no backend. Permissões `settings.read` / `settings.manage`.
A página Características Europartner usa metadata/CRUD nativos com abas por assunto.
Valores `false`, lista vazia e texto vazio são overrides explícitos; campo ausente herda
o padrão global. Dados efetivos são validados antes do consumo pelo template/workflow.

## Migração preservando dados

1. Faça backup e inventário do banco de origem e valide seu tenant de destino.
2. Com operador `settings.manage`, chame `POST /api/europartner/settings/migration`
   com `{}`. A resposta contém escopos/campos, códigos não mapeados e conflitos;
   não expõe os valores configurados. Nenhuma escrita ocorre.
3. Revise códigos não mapeados e conflitos. Um conflito com edição tipada impede
   aplicação; ajuste por decisão do responsável, sem sobrescrever silenciosamente.
4. Chame o mesmo endpoint com `{ "apply": true }`. Repetição não duplica registros.
   Cada upsert é atômico; não é uma transação sobre todos os escopos. Em falha de
   infraestrutura ou edição concorrente, execute conferência novamente e retome.
5. Compare emissor, banco, destinatários e automações padrão e por base na UI.

Os registros legados permanecem armazenados. Campos mapeados não alimentam a esteira
até existir seu correspondente tipado no mesmo escopo; um padrão global não esconde
override legado não migrado. Códigos adicionais não mapeados são preservados para
revisão, sem incorporá-los arbitrariamente ao contrato do cliente.

Rollback de código não apaga dados tipados. Evite escrever simultaneamente no modelo
legado e no novo; reconciliação entre eles é uma decisão de migração, não dual-write.

## Limites e sequência da frente

E1/E2 são alterações de código, sem migração de dados reais ou mudança de publicação.
O repositório contém o documento `invoice-os-v1.html` relacionado à issue #2, mas não
foram encontrados assunto, corpo de e-mail e logo aprovados para o bootstrap completo.
E3 permanece pendente desses materiais e da implementação do pacote versionado completo;
não foram criados substitutos presumidos.

E4 permanece pendente: este PR ainda conserva o adapter Omie anterior. O corte para o
gateway exige seu contrato publicado, reconciliação durável e migração de credenciais;
o novo guard do Core precisa ser adotado antes de PDF, anexo, e-mail e atualização de OS,
inclusive jobs já enfileirados. Não considerar este PR proteção completa da esteira.

E5 exige PDF/e-mail reais aprovados, comparação visual, destinatários autorizados,
contrato comercial real e testes HML de sucesso, suspensão, expiração, timeout, callback
e replay sem duplicação. O roadmap multi-tenant reutilizável continua na issue #172.

Gates: `npm run check` (docs, conformance, testes, build). Os testes adicionados cobrem
tipos, precedência, overrides, dry-run, repetição, conflito e migração incompleta por base.
