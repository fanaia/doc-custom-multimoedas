import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startCentralFromManifest, useOonApi } from "@oondemand/oon-core-front";
import { useNavigate, useSearchParams } from "react-router-dom";
import app from "../../central.app.json";
import ui from "../central.ui.json";

type Item = Record<string, any> & { _id: string };
type Catalogs = { bases: Item[]; imagens: Item[]; templates: Item[]; documentos: Item[]; configuracoes: Item[]; etapas: Item[] };

const card: React.CSSProperties = { background: "white", border: "1px solid #dce3ea", borderRadius: 12, padding: 18 };
const input: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", width: "100%" };
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 16px", background: "#0077b6", color: "white", cursor: "pointer" };
const secondary: React.CSSProperties = { ...button, background: "white", color: "#075985", border: "1px solid #9cc8dc" };
const danger: React.CSSProperties = { ...button, background: "#c92a2a" };

function errorText(error: any) { return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Não foi possível concluir a operação."; }
function Notice({ message, error }: { message?: string; error?: string }) { if (!message && !error) return null; return <p role="status" style={{ color: error ? "#c92a2a" : "#087f5b", background: error ? "#fff5f5" : "#ebfbee", padding: 10, borderRadius: 8 }}>{error || message}</p>; }
async function filePayload(file?: File | null) { if (!file?.size) return {}; const conteudo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); }); return { nomeArquivo: file.name, contentType: file.type, conteudo }; }

function useCatalogs() {
  const { http } = useOonApi();
  return useQuery({ queryKey: ["doc-custom-catalogs"], queryFn: async () => (await http.get<Catalogs>("/api/doc-custom/operacao/catalogos")).data });
}

function Header({ title, description }: { title: string; description: string }) {
  return <div style={{ marginBottom: 20 }}><h1 style={{ fontSize: 26, margin: 0 }}>{title}</h1><p style={{ color: "#64748b" }}>{description}</p></div>;
}

function BasesOmiePage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const done = (text: string) => { setError(""); setMessage(text); cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }); };
  const save = useMutation({ mutationFn: async (data: any) => (await http.post("/api/doc-custom/bases", data)).data, onSuccess: () => { setOpen(false); done("Base adicionada com sucesso."); }, onError: (e) => setError(errorText(e)) });
  const action = useMutation({ mutationFn: async ({ id, operation }: any) => (await http.post(`/api/doc-custom/bases/${id}/${operation}`)).data, onSuccess: (data, input) => done(input.operation === "testar" ? "Conexão validada com sucesso." : `${Number(data.total || 0)} registros sincronizados com sucesso.`), onError: (e) => setError(errorText(e)) });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate(Object.fromEntries(new FormData(event.currentTarget))); }
  return <div><Header title="Bases Omie" description="Conecte todas as empresas Omie usadas nesta operação." />
    <Notice message={message} error={error}/>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button style={button} onClick={() => setOpen(!open)}>+ Adicionar base Omie</button></div>
    {open && <form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
      <input style={input} name="nome" placeholder="Nome da empresa" required/><input style={input} name="codigo" placeholder="Código interno" required/>
      <input style={input} name="cnpj" placeholder="CNPJ" required/><select style={input} name="ambiente"><option value="producao">Produção</option><option value="homologacao">Homologação</option></select>
      <input style={input} name="appKey" placeholder="App Key" required/><input style={input} name="appSecret" type="password" placeholder="App Secret" required/>
      <button style={button} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar base"}</button>
    </form>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>{query.data?.bases.map(base => { const stageCount = query.data?.etapas.filter(stage => String(stage.baseOmieId?._id || stage.baseOmieId) === String(base._id)).length || 0; return <div style={card} key={base._id}>
      <strong style={{ fontSize: 18 }}>{base.nome}</strong><p>{base.cnpj} · {base.ambiente}</p><p>Conexão: <b>{base.statusConexao || "não testada"}</b></p><p style={{ color: "#64748b" }}>App Key: {base.appKeyMasked || "configurada"}</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={button} onClick={() => action.mutate({id:base._id,operation:"testar"})}>Testar conexão</button>{stageCount > 0 ? <button style={secondary} onClick={() => navigate(`/etapas-omie?baseOmieId=${encodeURIComponent(base._id)}`)}>Ver etapas ({stageCount})</button> : <button style={secondary} onClick={() => action.mutate({id:base._id,operation:"etapas/sincronizar"})}>Sincronizar etapas</button>}<button style={secondary} onClick={() => action.mutate({id:base._id,operation:"categorias/sincronizar"})}>Sincronizar categorias</button><button style={secondary} onClick={() => action.mutate({id:base._id,operation:"contas-correntes/sincronizar"})}>Sincronizar contas correntes</button></div>
    </div>})}</div>
  </div>;
}

function EtapasOmiePage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient(); const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const baseOmieId = searchParams.get("baseOmieId") || "";
  const update = useMutation({
    mutationFn: async () => (await http.post(`/api/doc-custom/bases/${baseOmieId}/etapas/sincronizar`)).data,
    onSuccess: (data) => { setError(""); setMessage(`${Number(data.total || 0)} etapas atualizadas com sucesso.`); cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }); },
    onError: (e) => { setMessage(""); setError(errorText(e)); },
  });
  const rows = (query.data?.etapas || []).filter(stage => !baseOmieId || String(stage.baseOmieId?._id || stage.baseOmieId) === baseOmieId);
  return <div><Header title="Etapas Omie" description="Consulte as etapas sincronizadas e atualize-as diretamente a partir da base Omie."/><Notice message={message} error={error}/>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,marginBottom:14}}><select style={{...input,maxWidth:360}} value={baseOmieId} onChange={event => { const value = event.target.value; setSearchParams(value ? { baseOmieId: value } : {}); }}><option value="">Todas as bases Omie</option>{query.data?.bases.map(base => <option key={base._id} value={base._id}>{base.nome}</option>)}</select><button style={button} disabled={!baseOmieId || update.isPending} onClick={() => update.mutate()}>{update.isPending ? "Atualizando..." : "Atualizar etapas"}</button></div>
    <div style={card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Base Omie</th><th align="left">Código</th><th align="left">Descrição</th><th align="left">Status</th><th align="left">Sincronizada em</th></tr></thead><tbody>{rows.map(stage => <tr key={stage._id}><td>{stage.baseOmieId?.nome || "-"}</td><td>{stage.codigo}</td><td>{stage.descricao}</td><td>{stage.status}</td><td>{stage.sincronizadaEm ? new Date(stage.sincronizadaEm).toLocaleString("pt-BR") : "-"}</td></tr>)}{!query.isLoading && rows.length === 0 && <tr><td colSpan={5} style={{padding:"24px 0",color:"#64748b"}}>Nenhuma etapa sincronizada.</td></tr>}</tbody></table></div>
  </div>;
}

function ImagensPage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient(); const [preview, setPreview] = useState<{ item: Item; url: string }>(); const [editing,setEditing]=useState<Item>(); const [view,setView]=useState<"cards"|"list">("cards"); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const finish=(text:string)=>{setMessage(text);setError("");setEditing(undefined);cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});};
  const upload = useMutation({ mutationFn: async (payload: any) => (await http.post("/api/doc-custom/imagens/upload", payload)).data, onSuccess: () => finish("Imagem enviada com sucesso."), onError:e=>setError(errorText(e)) });
  const update = useMutation({ mutationFn: async ({id,payload}:any) => (await http.put(`/api/doc-custom/imagens/${id}`,payload)).data, onSuccess: () => finish("Imagem atualizada com sucesso."), onError:e=>setError(errorText(e)) });
  const remove = useMutation({ mutationFn: async (id:string) => (await http.delete(`/api/doc-custom/imagens/${id}`)).data, onSuccess: () => finish("Imagem excluída com sucesso."), onError:e=>setError(errorText(e)) });
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("arquivo") as File; upload.mutate({ codigo: form.get("codigo"), descricao: form.get("descricao"), ...await filePayload(file) }); }
  async function submitEdit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);const file=form.get("arquivo") as File;update.mutate({id:editing?._id,payload:{codigo:form.get("codigo"),descricao:form.get("descricao"),status:form.get("status"),...await filePayload(file)}});}
  async function showPreview(item: Item) { const response = await http.get(`/api/doc-custom/imagens/${item._id}/conteudo`, { responseType: "blob" }); setPreview(previous => { if (previous) URL.revokeObjectURL(previous.url); return { item, url: URL.createObjectURL(response.data as Blob) }; }); }
  function closePreview() { setPreview(previous => { if (previous) URL.revokeObjectURL(previous.url); return undefined; }); }
  return <div><Header title="Imagens" description="Envie os arquivos usados pelos templates; formato e tamanho são identificados automaticamente." />
    <Notice message={message} error={error}/><form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, marginBottom: 18 }}><input style={input} name="codigo" placeholder="Código (ex.: logo)" required/><input style={input} name="descricao" placeholder="Descrição (opcional)"/><input style={input} name="arquivo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required/><button style={button}>Enviar</button></form>
    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginBottom:12}}><button style={view==="cards"?button:secondary} onClick={()=>setView("cards")}>Miniaturas</button><button style={view==="list"?button:secondary} onClick={()=>setView("list")}>Lista</button></div>
    <div style={{ display: "grid", gridTemplateColumns: view==="cards"?"repeat(auto-fit,minmax(240px,1fr))":"1fr", gap: 14 }}>{query.data?.imagens.map(img => <div style={{...card,display:view==="list"?"grid":"block",gridTemplateColumns:"2fr 2fr auto",alignItems:"center",gap:12}} key={img._id}><strong>{img.descricao || img.codigo}</strong><p>{img.nomeArquivo} · {(Number(img.tamanho)/1024).toFixed(1)} KB</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={button} onClick={() => showPreview(img)}>Visualizar</button><button style={secondary} onClick={()=>setEditing(img)}>Alterar</button><button style={danger} onClick={()=>confirm("Excluir esta imagem?")&&remove.mutate(img._id)}>Excluir</button></div></div>)}</div>
    {editing&&<form onSubmit={submitEdit} style={{...card,position:"fixed",zIndex:1001,inset:"15% 25% auto",display:"grid",gap:12,boxShadow:"0 20px 60px #0004"}}><h2>Alterar imagem</h2><input style={input} name="codigo" defaultValue={editing.codigo} required/><input style={input} name="descricao" defaultValue={editing.descricao||""} placeholder="Descrição (opcional)"/><select style={input} name="status" defaultValue={editing.status}><option value="ativo">Ativa</option><option value="inativo">Inativa</option></select><input style={input} name="arquivo" type="file" accept="image/png,image/jpeg,image/gif,image/webp"/><div style={{display:"flex",gap:8}}><button style={button}>Salvar</button><button type="button" style={secondary} onClick={()=>setEditing(undefined)}>Cancelar</button></div></form>}
    {preview && <div onClick={closePreview} style={{ position:"fixed", inset:0, background:"#0009", display:"grid", placeItems:"center", zIndex:1000 }}><div style={{...card,maxWidth:"80vw"}} onClick={e=>e.stopPropagation()}><img alt={preview.item.descricao} src={preview.url} style={{maxWidth:"70vw",maxHeight:"70vh"}}/><p><button style={button} onClick={closePreview}>Fechar</button></p></div></div>}
  </div>;
}

function TemplatesPage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache=useQueryClient(); const [templateId,setTemplateId]=useState(""); const [baseOmieId,setBase]=useState(""); const [codigoOs,setCodigo]=useState(""); const [result,setResult]=useState<any>(); const [editing,setEditing]=useState<Item|null>(); const [message,setMessage]=useState("");const [error,setError]=useState("");
  const finish=(text:string)=>{setMessage(text);setError("");setEditing(undefined);cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});};
  const preview = useMutation({ mutationFn: async () => (await http.post(`/api/doc-custom/templates/${templateId}/preview`, { baseOmieId, codigoOs })).data, onSuccess:(data)=>{setResult(data);setMessage("Template carregado e renderizado com sucesso.");setError("");}, onError:(e)=>{setResult(undefined);setMessage("");setError(errorText(e));} });
  const save=useMutation({mutationFn:async({id,payload}:any)=>id?(await http.put(`/api/doc-custom/templates/${id}`,payload)).data:(await http.post("/api/doc-custom/templates",payload)).data,onSuccess:(data)=>finish(data.message||"Template salvo com sucesso."),onError:e=>setError(errorText(e))});
  const remove=useMutation({mutationFn:async(id:string)=>(await http.delete(`/api/doc-custom/templates/${id}`)).data,onSuccess:(data)=>finish(data.message||"Template excluído."),onError:e=>setError(errorText(e))});
  async function edit(item:Item){setError("");try{const data=(await http.get(`/api/doc-custom/templates/${item._id}`)).data;setEditing(data.template);}catch(e){setError(errorText(e));}}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));save.mutate({id:editing?._id,payload:form});}
  return <div><Header title="Templates EJS" description="Teste o template com dados reais de uma ordem de serviço Omie antes de usá-lo." />
    <Notice message={message} error={error}/><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button style={button} onClick={()=>setEditing({} as Item)}>+ Novo template</button></div>
    {editing!==undefined&&<form onSubmit={submit} style={{...card,display:"grid",gridTemplateColumns:"1fr 2fr 1fr 1fr",gap:12,marginBottom:18}}><input style={input} name="codigo" defaultValue={editing?.codigo||""} placeholder="Código" required/><input style={input} name="descricao" defaultValue={editing?.descricao||""} placeholder="Descrição" required/><select style={input} name="tipo" defaultValue={editing?.tipo||"documento"}><option value="documento">Documento</option><option value="assunto">Assunto</option><option value="corpo-email">Corpo do e-mail</option></select><input style={input} name="versao" type="number" min="1" defaultValue={editing?.versao||1}/><textarea style={{...input,gridColumn:"1/-1",minHeight:280,fontFamily:"monospace"}} name="conteudo" defaultValue={editing?.conteudo||""} placeholder="Conteúdo EJS" required/><select style={input} name="status" defaultValue={editing?.status||"ativo"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select><div style={{display:"flex",gap:8}}><button style={button}>Salvar</button><button type="button" style={secondary} onClick={()=>setEditing(undefined)}>Cancelar</button></div></form>}
    <div style={{...card,marginBottom:18}}><table style={{width:"100%"}}><thead><tr><th align="left">Código</th><th align="left">Descrição</th><th align="left">Tipo</th><th align="left">Versão</th><th align="left">Ações</th></tr></thead><tbody>{query.isLoading&&<tr><td colSpan={5}>Carregando templates...</td></tr>}{query.data?.templates.map(t=><tr key={t._id}><td>{t.codigo}</td><td>{t.descricao}</td><td>{t.tipo}</td><td>{t.versao}</td><td><button style={secondary} onClick={()=>edit(t)}>Alterar</button> <button style={danger} onClick={()=>confirm("Excluir este template?")&&remove.mutate(t._id)}>Excluir</button></td></tr>)}</tbody></table></div>
    <div style={{...card, display:"grid",gridTemplateColumns:"2fr 2fr 1fr auto",gap:12}}><select style={input} value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Selecione o template</option>{query.data?.templates.map(t=><option key={t._id} value={t._id}>{t.descricao} · v{t.versao}</option>)}</select><select style={input} value={baseOmieId} onChange={e=>setBase(e.target.value)}><option value="">Selecione a base Omie</option>{query.data?.bases.map(b=><option key={b._id} value={b._id}>{b.nome}</option>)}</select><input style={input} value={codigoOs} onChange={e=>setCodigo(e.target.value)} placeholder="Código da OS"/><button style={button} disabled={!templateId||!baseOmieId||!codigoOs} onClick={()=>preview.mutate()}>Carregar e visualizar</button></div>
    {result && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:18}}><div style={card}><h2>Documento</h2>{result.html ? <iframe title="Documento gerado" sandbox="" srcDoc={result.html} style={{width:"100%",height:600,border:"1px solid #ddd"}}/> : <pre style={{whiteSpace:"pre-wrap"}}>{result.rendered}</pre>}</div><div style={card}><h2>Variáveis carregadas</h2><pre style={{whiteSpace:"pre-wrap",maxHeight:600,overflow:"auto"}}>{JSON.stringify(result.variables,null,2)}</pre></div></div>}
  </div>;
}

function ConfiguracoesPage(){
  const {http}=useOonApi();const query=useCatalogs();const cache=useQueryClient();const [baseFilter,setBaseFilter]=useState("");const [editing,setEditing]=useState<Item|null>();const [message,setMessage]=useState("");const [error,setError]=useState("");
  const finish=(text:string)=>{setMessage(text);setError("");setEditing(undefined);cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});};
  const save=useMutation({mutationFn:async({id,payload}:any)=>id?(await http.put(`/api/doc-custom/configuracoes/${id}`,payload)).data:(await http.post("/api/doc-custom/configuracoes",payload)).data,onSuccess:()=>finish("Configuração salva com sucesso."),onError:e=>setError(errorText(e))});
  const remove=useMutation({mutationFn:async(id:string)=>(await http.delete(`/api/doc-custom/configuracoes/${id}`)).data,onSuccess:()=>finish("Configuração excluída com sucesso."),onError:e=>setError(errorText(e))});
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();save.mutate({id:editing?._id,payload:Object.fromEntries(new FormData(event.currentTarget))});}
  const rows=(query.data?.configuracoes||[]).filter(c=>!baseFilter||String(c.baseOmieId?._id||c.baseOmieId||"")===baseFilter);
  return <div><Header title="Configurações" description="Adicione, altere e exclua parâmetros diretamente na grade."/><Notice message={message} error={error}/><div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}><select style={{...input,maxWidth:320}} value={baseFilter} onChange={e=>setBaseFilter(e.target.value)}><option value="">Todas as bases Omie</option>{query.data?.bases.map(b=><option key={b._id} value={b._id}>{b.nome}</option>)}</select><button style={button} onClick={()=>setEditing({} as Item)}>+ Nova configuração</button></div>
  {editing!==undefined&&<form onSubmit={submit} style={{...card,display:"grid",gridTemplateColumns:"1fr 2fr 1fr 2fr 1fr",gap:10,marginBottom:14}}><input style={input} name="codigo" defaultValue={editing?.codigo||""} placeholder="Código" required/><input style={input} name="descricao" defaultValue={editing?.descricao||""} placeholder="Descrição" required/><select style={input} name="tipo" defaultValue={editing?.tipo||"texto"}><option value="texto">Texto</option><option value="numero">Número</option><option value="booleano">Booleano</option><option value="email">E-mail</option><option value="lista-emails">Lista de e-mails</option><option value="html">HTML</option></select><input style={input} name="valor" defaultValue={editing?.valor||""} placeholder="Valor" required/><select style={input} name="baseOmieId" defaultValue={editing?.baseOmieId?._id||editing?.baseOmieId||""}><option value="">Todas as bases</option>{query.data?.bases.map(b=><option key={b._id} value={b._id}>{b.nome}</option>)}</select><select style={input} name="status" defaultValue={editing?.status||"ativo"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select><div><button style={button}>Salvar</button> <button type="button" style={secondary} onClick={()=>setEditing(undefined)}>Cancelar</button></div></form>}
  <div style={card}><table style={{width:"100%"}}><thead><tr><th align="left">Código</th><th align="left">Descrição</th><th align="left">Tipo</th><th align="left">Valor</th><th align="left">Base Omie</th><th align="left">Status</th><th align="left">Ações</th></tr></thead><tbody>{rows.map(c=><tr key={c._id}><td>{c.codigo}</td><td>{c.descricao}</td><td>{c.tipo}</td><td>{c.valor}</td><td>{c.baseOmieId?.nome||"Todas"}</td><td>{c.status}</td><td><button style={secondary} onClick={()=>setEditing(c)}>Alterar</button> <button style={danger} onClick={()=>confirm("Excluir esta configuração?")&&remove.mutate(c._id)}>Excluir</button></td></tr>)}</tbody></table></div></div>;
}

function DocumentosPage() { const query=useCatalogs(); return <div><Header title="Documentos gerados" description="Documentos criados automaticamente pelos templates e pela esteira de processamento."/><div style={card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Arquivo</th><th align="left">Template</th><th align="left">Tamanho</th><th align="left">Gerado em</th></tr></thead><tbody>{query.data?.documentos.map(d=><tr key={d._id}><td>{d.nomeArquivo}</td><td>{d.templateCodigo} v{d.templateVersao}</td><td>{(Number(d.tamanho)/1024).toFixed(1)} KB</td><td>{new Date(d.geradoEm).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></div> }

const replaced = new Set(["BaseOmie", "Imagem", "Template", "Configuracao", "EtapaOmie"]);
const uiManifest = {
  ...ui,
  collections: ui.collections.filter((collection) => !replaced.has(collection.model)),
  documents: [],
  pages: [
    ...ui.pages,
    { id: "bases-omie-operacao", path: "/bases-omie", label: "Bases Omie", title: "Bases Omie", section: "Configurações", component: "BasesOmiePage", order: 10, permissions: ["bases.read"] },
    { id: "configuracoes-operacao", path: "/configuracoes", label: "Configurações", title: "Configurações", section: "Configurações", component: "ConfiguracoesPage", order: 11, permissions: ["settings.read"] },
    { id: "etapas-omie-operacao", path: "/etapas-omie", label: "Etapas Omie", title: "Etapas Omie", section: "Configurações", component: "EtapasOmiePage", order: 12, permissions: ["bases.read"] },
    { id: "templates-operacao", path: "/templates", label: "Templates EJS", title: "Templates EJS", section: "Documentos", component: "TemplatesPage", order: 20, permissions: ["templates.read"] },
    { id: "imagens-operacao", path: "/imagens", label: "Imagens", title: "Imagens", section: "Documentos", component: "ImagensPage", order: 30, permissions: ["templates.read"] },
    { id: "documentos-operacao", path: "/documentos-gerados", label: "Documentos gerados", title: "Documentos gerados", section: "Documentos", component: "DocumentosPage", order: 40, permissions: ["process.read"] },
  ],
};

startCentralFromManifest({ app, ui: uiManifest as Parameters<typeof startCentralFromManifest>[0]["ui"] }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
  customComponents: { BasesOmiePage, ConfiguracoesPage, EtapasOmiePage, ImagensPage, TemplatesPage, DocumentosPage },
});
