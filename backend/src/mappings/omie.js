"use strict";

const { defineOmieMapping } = require("@oondemand/oon-core-back");

// Registra o contrato Omie no runtime de integrações do Core. As instâncias de
// negócio continuam sendo as Bases Omie do tenant; o Core fornece a esteira e
// a auditoria dos tickets, enquanto as credenciais permanecem criptografadas
// no domínio da Central.
defineOmieMapping("doc-custom-multimoedas", {
  instances: [{ id: "tenant-bases", label: "Bases Omie configuradas" }],
  calls: {
    "listar-etapas": { label: "Sincronizar etapas", endpoint: "produtos/etapafat/", call: "ListarEtapasFaturamento", param: [{ pagina: 1, registros_por_pagina: 900 }], maxAttempts: 3 },
    "listar-categorias": { label: "Sincronizar categorias", endpoint: "geral/categorias/", call: "ListarCategorias", param: [{ pagina: 1, registros_por_pagina: 900 }], maxAttempts: 3 },
    "listar-contas-correntes": { label: "Sincronizar contas correntes", endpoint: "geral/contacorrente/", call: "ListarContasCorrentes", param: [{ pagina: 1, registros_por_pagina: 900, apenas_importado_api: "N" }], maxAttempts: 3 },
    "consultar-ordem-servico": {
      label: "Consultar ordem de serviço",
      endpoint: "servicos/os/",
      call: "ConsultarOS",
      param: [{ nCodOS: "$input.codigoOs" }],
      maxAttempts: 3,
    },
    "consultar-cliente": {
      label: "Consultar cliente",
      endpoint: "geral/clientes/",
      call: "ConsultarCliente",
      param: [{ codigo_cliente_omie: "$input.codigoCliente" }],
      maxAttempts: 3,
    },
    "anexar-fatura": {
      label: "Anexar fatura na ordem de serviço",
      endpoint: "geral/anexo/",
      call: "IncluirAnexo",
      param: [{ $path: "$input.param" }],
      maxAttempts: 3,
    },
    "atualizar-ordem-servico": {
      label: "Atualizar etapa da ordem de serviço",
      endpoint: "servicos/os/",
      call: "AlterarOS",
      param: [{ $path: "$input.param" }],
      maxAttempts: 3,
    },
  },
});
