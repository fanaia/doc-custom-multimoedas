# Frontend code-first

O frontend de todo App Oon é composto em TypeScript/React. O `appKind` não
limita páginas, componentes, layouts ou temas locais.

```tsx
import { defineOonApp, startOonApp } from "@oondemand/oon-core-front";
import { defineOonNavigation, defineOonRoutes } from "@oondemand/oon-core-front/routing";
import { HomePage } from "./pages/HomePage";

const routes = defineOonRoutes([{ path: "/", element: <HomePage /> }]);
const navigation = defineOonNavigation([{ id: "home", label: "Início", to: "/" }]);

startOonApp(defineOonApp({
  app: { id: "meu-app", name: "Meu App" },
  api: { baseUrl: import.meta.env.VITE_API_URL },
  routes,
  navigation,
}));
```

Rotas aceitam `element`, `component`, `lazy`, `layout`, `permissions` e
`capabilities`. Rotas de autenticação e estados de ativação são reservadas.

Use os subpaths públicos:

- `@oondemand/oon-core-front/ui` para primitives e padrões;
- `@oondemand/oon-core-front/routing` para rotas e navegação;
- `@oondemand/oon-core-front/theme` para temas;
- `@oondemand/oon-core-front/hooks` para hooks;
- `@oondemand/oon-core-front/testing` para testes.

Não carregue código remoto, não desative guards, não exponha segredos no bundle
e não importe arquivos internos do pacote. Rode `npm run ooncore:conformance`.

