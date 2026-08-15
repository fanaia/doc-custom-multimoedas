import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startCentralFromManifest, useOonApi } from "@oondemand/oon-core-front";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import app from "../../central.app.json";
import ui from "../central.ui.json";

type Item = Record<string, any> & { _id: string };
type Catalogs = { bases: Item[]; imagens: Item[]; templates: Item[]; documentos: Item[]; configuracoes: Item[]; etapas: Item[]; categorias: Item[]; contasCorrentes: Item[]; gatilhos: Item[]; mapeamentos: Item[]; sendgridConfig?: Item };

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

function Header({ title, description, parent = { label: "Início", to: "/" } }: { title: string; description: string; parent?: { label: string; to: string } }) {
  return <div style={{ marginBottom: 20 }}><nav aria-label="Migalhas de navegação" style={{display:"flex",gap:8,alignItems:"center",marginBottom:12,fontSize:14}}><Link to={parent.to} style={{color:"#0077b6",textDecoration:"none"}}>← {parent.label}</Link><span style={{color:"#94a3b8"}}>/</span><span aria-current="page" style={{color:"#475569"}}>{title}</span></nav><h1 style={{ fontSize: 26, margin: 0 }}>{title}</h1><p style={{ color: "#64748b" }}>{description}</p></div>;
}

function BasesOmiePage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false); const [webhook,setWebhook]=useState<any>(); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const done = (text: string) => { setError(""); setMessage(text); cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }); };
  const save = useMutation({ mutationFn: async (data: any) => (await http.post("/api/doc-custom/bases", data)).data, onSuccess: () => { setOpen(false); done("Base adicionada com sucesso."); }, onError: (e) => setError(errorText(e)) });
  const action = useMutation({ mutationFn: async ({ id, operation }: any) => (await http.post(`/api/doc-custom/bases/${id}/${operation}`)).data, onSuccess: (data, input) => done(input.operation === "testar" ? "Conexão validada com sucesso." : `${Number(data.total || 0)} registros sincronizados com sucesso.`), onError: (e) => setError(errorText(e)) });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate(Object.fromEntries(new FormData(event.currentTarget))); }
  async function showWebhook(base:Item,rotate=false){try{const response=rotate?await http.post(`/api/doc-custom/bases/${base._id}/webhook/rotacionar`):await http.get(`/api/doc-custom/bases/${base._id}/webhook`);setWebhook({...response.data,baseNome:base.nome});setError("");}catch(e){setError(errorText(e));}}
  return <div><Header title="Bases Omie" description="Conecte todas as empresas Omie usadas nesta operação." />
    <Notice message={message} error={error}/>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button style={button} onClick={() => setOpen(!open)}>+ Adicionar base Omie</button></div>
    {open && <form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
      <input style={input} name="nome" placeholder="Nome da empresa" required/><input style={input} name="codigo" placeholder="Código interno" required/>
      <input style={input} name="cnpj" placeholder="CNPJ" required/><select style={input} name="ambiente"><option value="producao">Produção</option><option value="homologacao">Homologação</option></select>
      <input style={input} name="appKey" placeholder="App Key" required/><input style={input} name="appSecret" type="password" placeholder="App Secret" required/>
      <button style={button} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar base"}</button>
    </form>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>{query.data?.bases.map(base => { const belongsToBase = (item: Item) => String(item.baseOmieId?._id || item.baseOmieId) === String(base._id); const stageCount = query.data?.etapas.filter(belongsToBase).length || 0; const categoryCount = query.data?.categorias.filter(belongsToBase).length || 0; const accountCount = query.data?.contasCorrentes.filter(belongsToBase).length || 0; return <div style={card} key={base._id}>
      <strong style={{ fontSize: 18 }}>{base.nome}</strong><p>{base.cnpj} · {base.ambiente}</p><p>Conexão: <b>{base.statusConexao || "não testada"}</b></p><p style={{ color: "#64748b" }}>App Key: {base.appKeyMasked || "configurada"}</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={button} onClick={() => action.mutate({id:base._id,operation:"testar"})}>Testar conexão</button><button style={secondary} onClick={()=>showWebhook(base)}>Webhook Omie</button>{stageCount > 0 ? <button style={secondary} onClick={() => navigate(`/etapas-omie?baseOmieId=${encodeURIComponent(base._id)}`)}>Ver etapas ({stageCount})</button> : <button style={secondary} onClick={() => action.mutate({id:base._id,operation:"etapas/sincronizar"})}>Sincronizar etapas</button>}{categoryCount > 0 ? <button style={secondary} onClick={() => navigate(`/categorias-omie?baseOmieId=${encodeURIComponent(base._id)}`)}>Ver categorias ({categoryCount})</button> : <button style={secondary} onClick={() => action.mutate({id:base._id,operation:"categorias/sincronizar"})}>Sincronizar categorias</button>}{accountCount > 0 ? <button style={secondary} onClick={() => navigate(`/contas-correntes-omie?baseOmieId=${encodeURIComponent(base._id)}`)}>Ver contas correntes ({accountCount})</button> : <button style={secondary} onClick={() => action.mutate({id:base._id,operation:"contas-correntes/sincronizar"})}>Sincronizar contas correntes</button>}</div>
    </div>})}</div>
    {webhook&&<div style={{...card,marginTop:16}}><strong>Webhook único Omie — {webhook.baseNome}</strong><p style={{color:"#64748b"}}>Cadastre a URL abaixo no tópico necessário desta base. O token identifica a base e o tenant com segurança.</p><div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"12px 16px",marginBottom:12}}><strong>Tópico obrigatório no Omie</strong><ul style={{marginBottom:0}}><li><strong>Etapa da Ordem de Serviço alterada</strong> — nome técnico: <code>OrdemServico.EtapaAlterada</code></li></ul><p style={{color:"#64748b",marginBottom:0}}>Não é necessário cadastrar inclusão, exclusão ou faturamento, pois esses eventos não iniciam a esteira.</p></div><input aria-label="URL do webhook Omie" readOnly style={input} value={webhook.webhookUrl}/><div style={{display:"flex",gap:8,marginTop:10}}><button style={button} onClick={()=>navigator.clipboard.writeText(webhook.webhookUrl)}>Copiar URL</button><button style={danger} onClick={()=>{const base=query.data?.bases.filter(item=>item._id===webhook.baseId)[0];if(base&&confirm("Rotacionar o token? A URL anterior deixará de funcionar."))showWebhook(base,true);}}>Rotacionar token</button><button style={secondary} onClick={()=>setWebhook(undefined)}>Fechar</button></div></div>}
  </div>;
}

function SynchronizedOmieListPage({ kind }: { kind: "etapas" | "categorias" | "contas-correntes" }) {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient(); const [searchParams, setSearchParams] = useSearchParams();
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const baseOmieId = searchParams.get("baseOmieId") || "";
  const label = kind === "etapas" ? "etapas" : kind === "categorias" ? "categorias" : "contas correntes";
  const title = kind === "etapas" ? "Etapas Omie" : kind === "categorias" ? "Categorias Omie" : "Contas correntes Omie";
  const allRows = kind === "etapas" ? query.data?.etapas : kind === "categorias" ? query.data?.categorias : query.data?.contasCorrentes;
  const update = useMutation({
    mutationFn: async () => (await http.post(`/api/doc-custom/bases/${baseOmieId}/${kind}/sincronizar`)).data,
    onSuccess: (data) => { setError(""); setMessage(`${Number(data.total || 0)} ${label} atualizadas com sucesso.`); cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }); },
    onError: (e) => { setMessage(""); setError(errorText(e)); },
  });
  const rows = (allRows || []).filter(item => !baseOmieId || String(item.baseOmieId?._id || item.baseOmieId) === baseOmieId);
  return <div><Header title={title} description={`Lista somente leitura das ${label} sincronizadas com o Omie.`} parent={{label:"Bases Omie",to:"/bases-omie"}}/><Notice message={message} error={error}/>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,marginBottom:14}}><select aria-label="Base Omie" style={{...input,maxWidth:360}} value={baseOmieId} onChange={event => { const value = event.target.value; setSearchParams(value ? { baseOmieId: value } : {}); }}><option value="">Todas as bases Omie</option>{query.data?.bases.map(base => <option key={base._id} value={base._id}>{base.nome}</option>)}</select><button style={button} disabled={!baseOmieId || update.isPending} onClick={() => update.mutate()}>{update.isPending ? "Atualizando..." : `Atualizar ${label}`}</button></div>
    <div style={card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Base Omie</th><th align="left">Código</th><th align="left">Descrição</th>{kind === "contas-correntes" && <th align="left">Banco</th>}<th align="left">Status</th><th align="left">Sincronizada em</th></tr></thead><tbody>{rows.map(item => <tr key={item._id}><td>{item.baseOmieId?.nome || "-"}</td><td>{item.codigo}</td><td>{item.descricao}</td>{kind === "contas-correntes" && <td>{item.banco || "-"}</td>}<td>{item.status}</td><td>{item.sincronizadaEm ? new Date(item.sincronizadaEm).toLocaleString("pt-BR") : "-"}</td></tr>)}{!query.isLoading && rows.length === 0 && <tr><td colSpan={kind === "contas-correntes" ? 6 : 5} style={{padding:"24px 0",color:"#64748b"}}>Nenhum registro sincronizado.</td></tr>}</tbody></table></div>
  </div>;
}

function EtapasOmiePage() { return <SynchronizedOmieListPage kind="etapas"/>; }
function CategoriasOmiePage() { return <SynchronizedOmieListPage kind="categorias"/>; }
function ContasCorrentesOmiePage() { return <SynchronizedOmieListPage kind="contas-correntes"/>; }

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
  const { http } = useOonApi(); const query = useCatalogs(); const cache=useQueryClient(); const [templateId,setTemplateId]=useState(""); const [baseOmieId,setBase]=useState(""); const [numeroOs,setNumeroOs]=useState(""); const [result,setResult]=useState<any>(); const [editing,setEditing]=useState<Item|null>(); const [message,setMessage]=useState("");const [error,setError]=useState("");
  const finish=(text:string)=>{setMessage(text);setError("");setEditing(undefined);cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});};
  const preview = useMutation({ mutationFn: async () => (await http.post(`/api/doc-custom/templates/${templateId}/preview`, { baseOmieId, numeroOs })).data, onSuccess:(data)=>{setResult(data);setMessage("Template carregado e renderizado com sucesso.");setError("");}, onError:(e)=>{setResult(undefined);setMessage("");setError(errorText(e));} });
  const save=useMutation({mutationFn:async({id,payload}:any)=>id?(await http.put(`/api/doc-custom/templates/${id}`,payload)).data:(await http.post("/api/doc-custom/templates",payload)).data,onSuccess:(data)=>finish(data.message||"Template salvo com sucesso."),onError:e=>setError(errorText(e))});
  const remove=useMutation({mutationFn:async(id:string)=>(await http.delete(`/api/doc-custom/templates/${id}`)).data,onSuccess:(data)=>finish(data.message||"Template excluído."),onError:e=>setError(errorText(e))});
  async function edit(item:Item){setError("");try{const data=(await http.get(`/api/doc-custom/templates/${item._id}`)).data;setEditing(data.template);}catch(e){setError(errorText(e));}}
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));save.mutate({id:editing?._id,payload:form});}
  return <div><Header title="Templates EJS" description="Teste o template com dados reais de uma ordem de serviço Omie antes de usá-lo." />
    <Notice message={message} error={error}/><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button style={button} onClick={()=>setEditing({} as Item)}>+ Novo template</button></div>
    {editing!==undefined&&<form onSubmit={submit} style={{...card,display:"grid",gridTemplateColumns:"1fr 2fr 1fr 1fr 1fr",gap:12,marginBottom:18}}><input style={input} name="codigo" defaultValue={editing?.codigo||""} placeholder="Código" required/><input style={input} name="descricao" defaultValue={editing?.descricao||""} placeholder="Descrição" required/><select style={input} name="tipo" defaultValue={editing?.tipo||"documento"}><option value="documento">Documento</option><option value="assunto">Assunto</option><option value="corpo-email">Corpo do e-mail</option></select><input style={input} name="versao" type="number" min="1" defaultValue={editing?.versao||1}/><select style={input} name="contratoVariaveis" defaultValue={editing?._id?(editing.contratoVariaveis||"legacy-v1"):"native-v2"}><option value="native-v2">Variáveis nativas v2</option><option value="legacy-v1">Compatibilidade legado v1</option></select><textarea style={{...input,gridColumn:"1/-1",minHeight:280,fontFamily:"monospace"}} name="conteudo" defaultValue={editing?.conteudo||""} placeholder="Conteúdo EJS" required/><select style={input} name="status" defaultValue={editing?.status||"ativo"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select><div style={{display:"flex",gap:8}}><button style={button}>Salvar</button><button type="button" style={secondary} onClick={()=>setEditing(undefined)}>Cancelar</button></div></form>}
    <div style={{...card,marginBottom:18}}><table style={{width:"100%"}}><thead><tr><th align="left">Código</th><th align="left">Descrição</th><th align="left">Tipo</th><th align="left">Versão</th><th align="left">Contrato</th><th align="left">Ações</th></tr></thead><tbody>{query.isLoading&&<tr><td colSpan={6}>Carregando templates...</td></tr>}{query.data?.templates.map(t=><tr key={t._id}><td>{t.codigo}</td><td>{t.descricao}</td><td>{t.tipo}</td><td>{t.versao}</td><td>{t.contratoVariaveis||"legacy-v1"}</td><td><button style={secondary} onClick={()=>edit(t)}>Alterar</button> <button style={danger} onClick={()=>confirm("Excluir este template?")&&remove.mutate(t._id)}>Excluir</button></td></tr>)}</tbody></table></div>
    <div style={{...card, display:"grid",gridTemplateColumns:"2fr 2fr 1fr auto",gap:12}}><select style={input} value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Selecione o template</option>{query.data?.templates.map(t=><option key={t._id} value={t._id}>{t.descricao} · v{t.versao}</option>)}</select><select style={input} value={baseOmieId} onChange={e=>setBase(e.target.value)}><option value="">Selecione a base Omie</option>{query.data?.bases.map(b=><option key={b._id} value={b._id}>{b.nome}</option>)}</select><input aria-label="Número da OS" style={input} value={numeroOs} onChange={e=>setNumeroOs(e.target.value)} placeholder="Número da OS"/><button style={button} disabled={!templateId||!baseOmieId||!numeroOs} onClick={()=>preview.mutate()}>Carregar e visualizar</button></div>
    {result && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:18}}><div style={card}><h2>Documento</h2>{result.html ? <iframe title="Documento gerado" sandbox="" srcDoc={result.html} style={{width:"100%",height:600,border:"1px solid #ddd"}}/> : <pre style={{whiteSpace:"pre-wrap"}}>{result.rendered}</pre>}</div><div style={card}><h2>Variáveis carregadas</h2><pre style={{whiteSpace:"pre-wrap",maxHeight:600,overflow:"auto"}}>{JSON.stringify(result.variables,null,2)}</pre></div></div>}
  </div>;
}

function GatilhosPage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient();
  const [gatilhoId,setGatilhoId]=useState(""); const [editingTrigger,setEditingTrigger]=useState<Item|null>(); const [editing,setEditing]=useState<Item|null>(); const [baseOmieId,setBaseOmieId]=useState(""); const [message,setMessage]=useState(""); const [error,setError]=useState("");
  const selectedTrigger = query.data?.gatilhos.filter(item=>item._id===gatilhoId)[0];
  const rows=(query.data?.mapeamentos||[]).filter(item=>String(item.gatilhoId?._id||item.gatilhoId)===gatilhoId);
  const selectedBase=baseOmieId || String(editing?.baseOmieId?._id||editing?.baseOmieId||"");
  const stages=(query.data?.etapas||[]).filter(item=>item.status==="ativo"&&String(item.baseOmieId?._id||item.baseOmieId)===selectedBase);
  const finish=(text:string)=>{setMessage(text);setError("");setEditing(undefined);setBaseOmieId("");cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});};
  const saveTrigger=useMutation({mutationFn:async({id,payload}:any)=>id?(await http.put(`/api/doc-custom/gatilhos/${id}`,payload)).data:(await http.post("/api/doc-custom/gatilhos",payload)).data,onSuccess:data=>{setEditingTrigger(undefined);finish(data.message||"Gatilho salvo com sucesso.");},onError:e=>setError(errorText(e))});
  const removeTrigger=useMutation({mutationFn:async(id:string)=>(await http.delete(`/api/doc-custom/gatilhos/${id}`)).data,onSuccess:data=>{setGatilhoId("");finish(data.message||"Gatilho excluído.");},onError:e=>setError(errorText(e))});
  const save=useMutation({mutationFn:async({id,payload}:any)=>id?(await http.put(`/api/doc-custom/gatilhos/${gatilhoId}/bases/${id}`,payload)).data:(await http.post(`/api/doc-custom/gatilhos/${gatilhoId}/bases`,payload)).data,onSuccess:data=>finish(data.message||"Etapas salvas com sucesso."),onError:e=>{setMessage("");setError(errorText(e));}});
  const remove=useMutation({mutationFn:async(id:string)=>(await http.delete(`/api/doc-custom/gatilhos/${gatilhoId}/bases/${id}`)).data,onSuccess:data=>finish(data.message||"Cadastro excluído."),onError:e=>setError(errorText(e))});
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();save.mutate({id:editing?._id,payload:Object.fromEntries(new FormData(event.currentTarget))});}
  function submitTrigger(event:FormEvent<HTMLFormElement>){event.preventDefault();saveTrigger.mutate({id:editingTrigger?._id,payload:Object.fromEntries(new FormData(event.currentTarget))});}
  function beginEdit(item:Item){setEditing(item);setBaseOmieId(String(item.baseOmieId?._id||item.baseOmieId));setMessage("");setError("");}
  const templateOptions=(tipo:string)=>query.data?.templates.filter(item=>item.tipo===tipo&&item.status==="ativo")||[];
  return <div><Header title="Gatilhos" description="Cadastre os documentos e as etapas de envio, erro e sucesso para cada Base Omie."/><Notice message={message} error={error}/>
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button style={button} onClick={()=>setEditingTrigger({} as Item)}>+ Novo gatilho</button></div>
    {editingTrigger!==undefined&&<form onSubmit={submitTrigger} style={{...card,display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:18}}><input style={input} name="codigo" defaultValue={editingTrigger?.codigo||""} placeholder="Código" required/><input style={input} name="descricao" defaultValue={editingTrigger?.descricao||""} placeholder="Descrição" required/>{(["templateDocumentoId","templateAssuntoId","templateCorpoId"] as const).map((field,index)=>{const tipo=["documento","assunto","corpo-email"][index];return <select style={input} name={field} key={field} defaultValue={editingTrigger?.[field]?._id||editingTrigger?.[field]||""} required><option value="">{["Template da fatura","Template do assunto","Template do corpo do e-mail"][index]}</option>{templateOptions(tipo).map(item=><option key={item._id} value={item._id}>{item.descricao} · v{item.versao}</option>)}</select>;})}<select style={input} name="status" defaultValue={editingTrigger?.status||"ativo"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select><div style={{gridColumn:"1/-1",display:"flex",gap:8}}><button style={button} disabled={saveTrigger.isPending}>{saveTrigger.isPending?"Salvando...":"Salvar gatilho"}</button><button type="button" style={secondary} onClick={()=>setEditingTrigger(undefined)}>Cancelar</button></div></form>}
    <div style={{...card,marginBottom:18}}><label htmlFor="gatilho"><strong>Gatilho</strong></label><div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}><select id="gatilho" style={input} value={gatilhoId} onChange={e=>{setGatilhoId(e.target.value);setEditing(undefined);setBaseOmieId("");}}><option value="">Selecione um gatilho</option>{query.data?.gatilhos.map(item=><option key={item._id} value={item._id}>{item.descricao} ({item.codigo})</option>)}</select>{selectedTrigger&&<><button style={secondary} onClick={()=>setEditingTrigger(selectedTrigger)}>Alterar gatilho</button><button style={danger} onClick={()=>confirm("Excluir este gatilho e seus cadastros de etapas?")&&removeTrigger.mutate(selectedTrigger._id)}>Excluir gatilho</button></>}</div></div>
    {selectedTrigger&&<><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div><strong>{selectedTrigger.descricao}</strong><div style={{color:"#64748b"}}>Uma configuração por Base Omie.</div></div><button style={button} onClick={()=>{setEditing({} as Item);setBaseOmieId("");}}>+ Cadastrar etapas da base</button></div>
    {editing!==undefined&&<form onSubmit={submit} style={{...card,display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:12,marginBottom:18}}>
      <select aria-label="Base Omie" style={input} name="baseOmieId" value={selectedBase} onChange={e=>setBaseOmieId(e.target.value)} required><option value="">Base Omie</option>{query.data?.bases.filter(base=>base.status==="ativo").map(base=><option key={base._id} value={base._id}>{base.nome}</option>)}</select>
      {(["etapaEnvio","etapaErro","etapaSucesso"] as const).map((field,index)=><select aria-label={["Etapa de envio","Etapa de erro","Etapa de sucesso"][index]} style={input} name={field} key={`${field}-${selectedBase}`} defaultValue={editing?.[field]||""} disabled={!selectedBase} required><option value="">{["Etapa de envio","Etapa de erro","Etapa de sucesso"][index]}</option>{stages.map(stage=><option key={stage._id} value={stage.codigo}>{stage.descricao} ({stage.codigo})</option>)}</select>)}
      <select style={input} name="status" defaultValue={editing?.status||"ativo"}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select>
      {selectedBase&&stages.length===0&&<p style={{gridColumn:"1/-1",color:"#c92a2a"}}>Esta base ainda não possui etapas ativas. Sincronize as etapas em Bases Omie antes de cadastrar.</p>}
      <div style={{gridColumn:"1/-1",display:"flex",gap:8}}><button style={button} disabled={save.isPending||stages.length<3}>{save.isPending?"Salvando...":"Salvar etapas"}</button><button type="button" style={secondary} onClick={()=>{setEditing(undefined);setBaseOmieId("");}}>Cancelar</button></div>
    </form>}
    <div style={card}><table style={{width:"100%"}}><thead><tr><th align="left">Base Omie</th><th align="left">Etapa de envio</th><th align="left">Etapa de erro</th><th align="left">Etapa de sucesso</th><th align="left">Status</th><th align="left">Ações</th></tr></thead><tbody>{rows.map(item=><tr key={item._id}><td>{item.baseOmieId?.nome||"-"}</td><td>{item.etapaEnvio}</td><td>{item.etapaErro}</td><td>{item.etapaSucesso}</td><td>{item.status}</td><td><button style={secondary} onClick={()=>beginEdit(item)}>Alterar</button> <button style={danger} onClick={()=>confirm("Excluir as etapas desta base?")&&remove.mutate(item._id)}>Excluir</button></td></tr>)}{rows.length===0&&<tr><td colSpan={6} style={{padding:24,color:"#64748b"}}>Nenhuma base configurada para este gatilho.</td></tr>}</tbody></table></div></>}
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

function IntegracoesPage(){
  const {http}=useOonApi();const query=useCatalogs();const cache=useQueryClient();const [message,setMessage]=useState("");const [error,setError]=useState("");
  const config=query.data?.sendgridConfig;
  const save=useMutation({mutationFn:async(payload:any)=>(await http.put("/api/doc-custom/integracoes/sendgrid",payload)).data,onSuccess:data=>{setError("");setMessage(data.message);cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});},onError:e=>setError(errorText(e))});
  const test=useMutation({mutationFn:async()=>(await http.post("/api/doc-custom/integracoes/sendgrid/testar")).data,onSuccess:data=>{setError("");setMessage(data.message);cache.invalidateQueries({queryKey:["doc-custom-catalogs"]});},onError:e=>setError(errorText(e))});
  function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();save.mutate(Object.fromEntries(new FormData(event.currentTarget)));}
  return <div><Header title="Integrações" description="Configure credenciais exclusivas deste tenant para os provedores externos."/><Notice message={message} error={error}/><form onSubmit={submit} style={{...card,maxWidth:900,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><div style={{gridColumn:"1/-1"}}><h2 style={{marginTop:0}}>SendGrid</h2><p style={{color:"#64748b"}}>A API Key é criptografada e nunca é exibida novamente. {config?.credencialConfigurada&&<>Credencial atual: <strong>{config.apiKeyMasked}</strong>.</>}</p></div><input style={input} name="apiKey" type="password" placeholder={config?.credencialConfigurada?"Nova API Key (deixe vazio para manter)":"API Key"} required={!config?.credencialConfigurada}/><select style={input} name="status" defaultValue={config?.status||"ativo"}><option value="ativo">Ativa</option><option value="inativo">Inativa</option></select><input style={input} name="remetenteEmail" type="email" defaultValue={config?.remetenteEmail||""} placeholder="E-mail remetente" required/><input style={input} name="remetenteNome" defaultValue={config?.remetenteNome||""} placeholder="Nome do remetente"/><div style={{gridColumn:"1/-1",display:"flex",gap:8,alignItems:"center"}}><button style={button} disabled={save.isPending}>{save.isPending?"Salvando...":"Salvar SendGrid"}</button><button type="button" style={secondary} disabled={!config?.credencialConfigurada||test.isPending} onClick={()=>test.mutate()}>{test.isPending?"Testando...":"Testar autenticação"}</button>{config&&<span style={{color:config.statusConexao==="ok"?"#087f5b":"#64748b"}}>Conexão: {config.statusConexao}</span>}</div></form></div>;
}

function TicketsIntegracaoPage(){
  const {http}=useOonApi();const catalogs=useCatalogs();const [provider,setProvider]=useState("");const [status,setStatus]=useState("");const [baseOmieId,setBase]=useState("");
  const query=useQuery({queryKey:["integration-tickets",provider,status,baseOmieId],queryFn:async()=>(await http.get("/api/doc-custom/integracoes/tickets",{params:{provider,status,baseOmieId}})).data.tickets as Item[]});
  return <div><Header title="Tickets de Integração" description="Acompanhe todas as chamadas Omie e SendGrid deste tenant."/><div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,280px))",gap:10,marginBottom:14}}><select style={input} value={provider} onChange={e=>setProvider(e.target.value)}><option value="">Todas as integrações</option><option value="omie">Omie</option><option value="sendgrid">SendGrid</option></select><select style={input} value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option><option value="processando">Processando</option><option value="sucesso">Sucesso</option><option value="falha">Falha</option></select><select style={input} value={baseOmieId} onChange={e=>setBase(e.target.value)}><option value="">Todas as bases</option>{catalogs.data?.bases.map(item=><option key={item._id} value={item._id}>{item.nome}</option>)}</select></div><div style={card}><table style={{width:"100%"}}><thead><tr><th align="left">Início</th><th align="left">Integração</th><th align="left">Operação</th><th align="left">Base</th><th align="left">Status</th><th align="left">Duração</th><th align="left">Retorno</th></tr></thead><tbody>{query.data?.map(item=><tr key={item._id}><td>{new Date(item.iniciadoEm).toLocaleString("pt-BR")}</td><td>{item.provider}</td><td>{item.operacao}</td><td>{item.baseOmieId?.nome||"-"}</td><td>{item.status}</td><td>{item.duracaoMs!=null?`${item.duracaoMs} ms`:"-"}</td><td>{item.mensagem||item.codigoExterno||"-"}</td></tr>)}{!query.isLoading&&!query.data?.length&&<tr><td colSpan={7} style={{padding:24,color:"#64748b"}}>Nenhum ticket de integração encontrado.</td></tr>}</tbody></table></div></div>;
}

function DocumentosPage() { const query=useCatalogs(); return <div><Header title="Documentos gerados" description="Documentos criados automaticamente pelos templates e pela esteira de processamento."/><div style={card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Arquivo</th><th align="left">Template</th><th align="left">Tamanho</th><th align="left">Gerado em</th></tr></thead><tbody>{query.data?.documentos.map(d=><tr key={d._id}><td>{d.nomeArquivo}</td><td>{d.templateCodigo} v{d.templateVersao}</td><td>{(Number(d.tamanho)/1024).toFixed(1)} KB</td><td>{new Date(d.geradoEm).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></div> }

function ProcessPdfViewer({ parent, record }: { parent?: Item; record?: Item }) {
  const { http } = useOonApi();
  const invoiceProcess = parent || record;
  const processId = String(invoiceProcess?._id || "");
  const artifactId = String(invoiceProcess?.artefatoPdfId?._id || invoiceProcess?.artefatoPdfId || "");
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!processId || !artifactId) { setPdfUrl(""); setError(""); return; }
    const controller = new AbortController();
    let objectUrl = "";
    setLoading(true); setError("");
    http.get(`/api/doc-custom/processos/${encodeURIComponent(processId)}/pdf`, { responseType: "blob", signal: controller.signal })
      .then((response) => {
        const file = response.data instanceof Blob ? response.data : new Blob([response.data], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(file);
        setPdfUrl(objectUrl);
      })
      .catch((requestError) => { if (!controller.signal.aborted) setError(errorText(requestError)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [artifactId, http, processId]);

  if (!artifactId) return <div style={{ ...card, color: "#64748b" }}>A fatura ainda não foi gerada para este processo.</div>;
  if (loading) return <div style={{ ...card, color: "#64748b" }}>Carregando PDF...</div>;
  if (error) return <Notice error={error}/>;
  if (!pdfUrl) return null;
  const pdfSource = `${pdfUrl}#zoom=${zoom}&toolbar=1&navpanes=0`;
  return <div style={{display:"grid",gap:10}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button type="button" aria-label="Reduzir zoom" style={secondary} onClick={()=>setZoom(value=>Math.max(50,value-25))}>−</button>
        <output aria-label="Zoom atual" style={{minWidth:58,textAlign:"center",fontWeight:600}}>{zoom}%</output>
        <button type="button" aria-label="Aumentar zoom" style={secondary} onClick={()=>setZoom(value=>Math.min(200,value+25))}>+</button>
        <button type="button" style={secondary} onClick={()=>setZoom(100)}>Restaurar</button>
      </div>
      <a href={pdfUrl} download={`fatura-${invoiceProcess?.numeroOs || processId}.pdf`} style={{...secondary,textDecoration:"none"}}>Baixar PDF</a>
    </div>
    <div style={{height:"68vh",minHeight:480,border:"1px solid #dce3ea",borderRadius:10,overflow:"hidden",background:"#eef2f6"}}>
      <iframe key={pdfSource} title={`Fatura ${invoiceProcess?.numeroOs || ""}`} src={pdfSource} style={{width:"100%",height:"100%",border:0}}/>
    </div>
  </div>;
}

const replaced = new Set(["BaseOmie", "Imagem", "Template", "Configuracao", "EtapaOmie", "CategoriaOmie", "ContaCorrenteOmie", "Gatilho"]);
const uiManifest = {
  ...ui,
  collections: ui.collections.filter((collection) => !replaced.has(collection.model)),
  documents: [],
  pages: [
    ...ui.pages,
    { id: "bases-omie-operacao", path: "/bases-omie", label: "Bases Omie", title: "Bases Omie", section: "Configurações", component: "BasesOmiePage", order: 10, permissions: ["bases.read"] },
    { id: "configuracoes-operacao", path: "/configuracoes", label: "Configurações", title: "Configurações", section: "Configurações", component: "ConfiguracoesPage", order: 11, permissions: ["settings.read"] },
    { id: "integracoes-operacao", path: "/integracoes", label: "Integrações", title: "Integrações", section: "Configurações", component: "IntegracoesPage", order: 12, permissions: ["settings.read"] },
    { id: "etapas-omie-operacao", path: "/etapas-omie", label: "Etapas Omie", title: "Etapas Omie", section: "Configurações", component: "EtapasOmiePage", order: 12, hidden: true, permissions: ["bases.read"] },
    { id: "categorias-omie-operacao", path: "/categorias-omie", label: "Categorias Omie", title: "Categorias Omie", section: "Configurações", component: "CategoriasOmiePage", order: 13, hidden: true, permissions: ["bases.read"] },
    { id: "contas-correntes-omie-operacao", path: "/contas-correntes-omie", label: "Contas correntes Omie", title: "Contas correntes Omie", section: "Configurações", component: "ContasCorrentesOmiePage", order: 14, hidden: true, permissions: ["bases.read"] },
    { id: "templates-operacao", path: "/templates", label: "Templates EJS", title: "Templates EJS", section: "Documentos", component: "TemplatesPage", order: 20, permissions: ["templates.read"] },
    { id: "gatilhos-operacao", path: "/gatilhos", label: "Gatilhos", title: "Gatilhos", section: "Documentos", component: "GatilhosPage", order: 21, permissions: ["triggers.read"] },
    { id: "imagens-operacao", path: "/imagens", label: "Imagens", title: "Imagens", section: "Documentos", component: "ImagensPage", order: 30, permissions: ["templates.read"] },
    { id: "documentos-operacao", path: "/documentos-gerados", label: "Documentos gerados", title: "Documentos gerados", section: "Documentos", component: "DocumentosPage", order: 40, permissions: ["process.read"] },
    { id: "tickets-integracao-operacao", path: "/configuracoes/integracao-omie/tickets", label: "Tickets de Integração", title: "Tickets de Integração", section: "Auditoria", component: "TicketsIntegracaoPage", order: 800, permissions: ["audit.read"] },
  ],
};

startCentralFromManifest({ app, ui: uiManifest as Parameters<typeof startCentralFromManifest>[0]["ui"] }, {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
  meusAppsUrl: import.meta.env.VITE_MEUS_APPS_URL,
  devToken: import.meta.env.DEV ? (import.meta.env.VITE_DEV_TOKEN ?? "dev-local") : undefined,
  customComponents: { BasesOmiePage, CategoriasOmiePage, ConfiguracoesPage, ContasCorrentesOmiePage, EtapasOmiePage, GatilhosPage, ImagensPage, IntegracoesPage, TemplatesPage, TicketsIntegracaoPage, DocumentosPage, ProcessPdfViewer },
});
