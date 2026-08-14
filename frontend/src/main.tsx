import { startCentralFromManifest } from "@oondemand/oon-core-front";
import app from "../../central.app.json";
import ui from "../central.ui.json";
import { BasesOmiePage, DocumentosPage, ImagensPage, TemplatesPage } from "./UsabilityPages";

const replaced = new Set(["BaseOmie", "Imagem", "Template"]);
const uiManifest = {
  ...ui,
  collections: ui.collections.filter((collection) => !replaced.has(collection.model)),
  documents: [],
  pages: [
    ...ui.pages,
    { id: "bases-omie-operacao", path: "/bases-omie", label: "Bases Omie", title: "Bases Omie", section: "Configurações", component: "BasesOmiePage", order: 10, permissions: ["bases.read"] },
    { id: "templates-operacao", path: "/templates", label: "Templates EJS", title: "Templates EJS", section: "Documentos", component: "TemplatesPage", order: 20, permissions: ["templates.read"] },
    { id: "imagens-operacao", path: "/imagens", label: "Imagens", title: "Imagens", section: "Documentos", component: "ImagensPage", order: 30, permissions: ["templates.read"] },
    { id: "documentos-operacao", path: "/documentos-gerados", label: "Documentos gerados", title: "Documentos gerados", section: "Documentos", component: "DocumentosPage", order: 40, permissions: ["process.read"] },
  ],
};

startCentralFromManifest({ app, ui: uiManifest as Parameters<typeof startCentralFromManifest>[0]["ui"] }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
  customComponents: { BasesOmiePage, ImagensPage, TemplatesPage, DocumentosPage },
});
