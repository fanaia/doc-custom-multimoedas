# Renderização de PDF

Use esta capability para transformar HTML em um `Buffer` PDF sem conhecer endpoint, credencial ou implementação do serviço. Requer OonCore `0.6.0` ou superior.

## Declaração

Declare a dependência de infraestrutura em `oon.deploy.json`:

```json
{
  "capabilities": {
    "pdfRendering": {
      "required": true,
      "minVersion": "1.0.0"
    }
  }
}
```

Não adicione URL, usuário, senha ou implementation reference. O runtime resolve esses valores na publicação. Esta declaração não pertence ao array `capabilities` de `central.app.json`.

## API pública do backend

```js
const {
  capabilities,
  defineRoutes,
  GenericError,
  requirePermission,
} = require("@oondemand/oon-core-back");

defineRoutes("/pdf", (router) => {
  router.private.post(
    "/render",
    requirePermission("pdf.render"),
    async (req, res) => {
      if (typeof req.body?.html !== "string" || !req.body.html.trim()) {
        throw new GenericError("Informe o HTML.", {
          statusCode: 422,
          code: "PDF_HTML_REQUIRED",
        });
      }

      const controller = new AbortController();
      const abort = () => controller.abort();
      req.once("aborted", abort);
      res.once("close", abort);

      try {
        const pdf = await capabilities.pdf.render(
          {
            html: req.body.html,
            format: req.body.format || "A4",
            printBackground: true,
          },
          {
            ...req.accessContext,
            correlationId: req.id,
            environment: process.env.APP_ENVIRONMENT,
            signal: controller.signal,
          },
        );

        res.type("application/pdf");
        res.set("Content-Disposition", 'attachment; filename="documento.pdf"');
        res.send(pdf);
      } finally {
        req.off("aborted", abort);
        res.off("close", abort);
      }
    },
  );
});
```

Declare `pdf.render` em `rbac.permissions` e conceda-a somente aos papéis necessários. O backend continua sendo a autoridade de permissão e tenant.

A assinatura é:

```ts
capabilities.pdf.render(input, context): Promise<Buffer>
```

| Campo de `input` | Tipo | Regra/default |
|---|---|---|
| `html` | string | obrigatório; máximo padrão de 2 MiB |
| `format` | `A3 \| A4 \| A5 \| Letter \| Legal` | `A4` |
| `landscape` | boolean | `false` |
| `marginTop`, `marginBottom`, `marginLeft`, `marginRight` | number | polegadas, de 0 a 4; `0.39` |
| `printBackground` | boolean | `true` |
| `timeoutMs` | number | mínimo 1.000 ms; padrão 30.000 ms; máximo do runtime, padrão 60.000 ms |

O `context` pode carregar `tenantId`, `appCode`, `environment`, `operationId`, `correlationId`/`requestId`, `signal` e, somente em testes, `fetchImpl`. A saída deve começar com `%PDF-` e tem limite padrão de 20 MiB.

## Preview e download no frontend

Preview do HTML deve usar iframe sem privilégios:

```tsx
<iframe title="Prévia" sandbox="" srcDoc={html} />
```

Para gerar e baixar usando o cliente autenticado do Core:

```tsx
import { useOonApi } from "@oondemand/oon-core-front";

function DownloadPdfButton({ html }: { html: string }) {
  const { http } = useOonApi();

  async function download() {
    const response = await http.post(
      "/pdf/render",
      { html, format: "A4" },
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = "documento.pdf";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <button onClick={download}>Gerar PDF</button>;
}
```

Nunca envie a geração diretamente a um endpoint de infraestrutura pelo navegador.

## Erros

`PdfRenderingError` expõe `code`, `statusCode`, `retryable` e detalhes sanitizados.

| Código | Retry | Significado |
|---|---:|---|
| `PDF_RENDERING_INVALID_INPUT` | não | HTML vazio ou acima do limite |
| `PDF_RENDERING_INVALID_OPTIONS` | não | formato, margem ou opção inválida |
| `PDF_RENDERING_UNAVAILABLE` | sim | capability não resolvida no ambiente |
| `PDF_RENDERING_CREDENTIAL_UNAVAILABLE` | sim | credencial interna não injetada |
| `PDF_RENDERING_IMPLEMENTATION_ERROR` | sim | implementação respondeu com falha |
| `PDF_RENDERING_TIMEOUT` | sim | prazo excedido ou sinal abortado |
| `PDF_RENDERING_SATURATED` | sim | concorrência/fila excedida |
| `PDF_RENDERING_TRANSPORT_ERROR` | sim | falha transitória de transporte |
| `PDF_RENDERING_INVALID_OUTPUT` | sim | saída inválida ou acima do limite |

Use retentativas apenas quando `error.retryable === true`, com backoff e idempotência na operação chamadora.

## Segurança e runtime local

- trate HTML do usuário como não confiável; sanitize no App e use interpolação escapada;
- prefira HTML autocontido; recursos remotos tornam o resultado não determinístico e podem ser bloqueados;
- nunca inclua segredos, tokens ou credenciais no HTML;
- não registre HTML nem bytes do PDF; registre correlação, duração, tamanhos e código de erro;
- propague cancelamento do request por `AbortSignal`;
- no runtime local, a capability falha fechado com `PDF_RENDERING_UNAVAILABLE` quando não resolvida;
- em testes automatizados, um transport fake pode ser injetado por `capabilities.configurePdfRendering` e deve devolver bytes iniciados por `%PDF-`; não gere um “PDF” textual falso no código do App.
