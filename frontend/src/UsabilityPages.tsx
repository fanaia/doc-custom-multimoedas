import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOonApi } from "@oondemand/oon-core-front";

type Item = Record<string, any> & { _id: string };
type Catalogs = { bases: Item[]; imagens: Item[]; templates: Item[]; documentos: Item[] };

const card: React.CSSProperties = { background: "white", border: "1px solid #dce3ea", borderRadius: 12, padding: 18 };
const input: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 12px", width: "100%" };
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 16px", background: "#0077b6", color: "white", cursor: "pointer" };

function useCatalogs() {
  const { http } = useOonApi();
  return useQuery({ queryKey: ["doc-custom-catalogs"], queryFn: async () => (await http.get<Catalogs>("/api/doc-custom/operacao/catalogos")).data });
}

function Header({ title, description }: { title: string; description: string }) {
  return <div style={{ marginBottom: 20 }}><h1 style={{ fontSize: 26, margin: 0 }}>{title}</h1><p style={{ color: "#64748b" }}>{description}</p></div>;
}

export function BasesOmiePage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient();
  const [open, setOpen] = useState(false); const [message, setMessage] = useState("");
  const save = useMutation({ mutationFn: async (data: any) => (await http.post("/api/doc-custom/bases", data)).data, onSuccess: () => { cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }); setOpen(false); setMessage("Base adicionada com sucesso."); } });
  const test = useMutation({ mutationFn: async (id: string) => (await http.post(`/api/doc-custom/bases/${id}/testar`)).data, onSuccess: () => { cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }); setMessage("Conexão validada com sucesso."); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); save.mutate(Object.fromEntries(new FormData(event.currentTarget))); }
  return <div><Header title="Bases Omie" description="Conecte todas as empresas Omie usadas nesta operação." />
    {message && <p style={{ color: "#087f5b" }}>{message}</p>}
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}><button style={button} onClick={() => setOpen(!open)}>+ Adicionar base Omie</button></div>
    {open && <form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginBottom: 18 }}>
      <input style={input} name="nome" placeholder="Nome da empresa" required/><input style={input} name="codigo" placeholder="Código interno" required/>
      <input style={input} name="cnpj" placeholder="CNPJ" required/><select style={input} name="ambiente"><option value="producao">Produção</option><option value="homologacao">Homologação</option></select>
      <input style={input} name="appKey" placeholder="App Key" required/><input style={input} name="appSecret" type="password" placeholder="App Secret" required/>
      <button style={button} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar base"}</button>
    </form>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>{query.data?.bases.map(base => <div style={card} key={base._id}>
      <strong style={{ fontSize: 18 }}>{base.nome}</strong><p>{base.cnpj} · {base.ambiente}</p><p>Conexão: <b>{base.statusConexao || "não testada"}</b></p><p style={{ color: "#64748b" }}>App Key: {base.appKeyMasked || "configurada"}</p>
      <button style={button} onClick={() => test.mutate(base._id)}>Testar conexão</button>
    </div>)}</div>
  </div>;
}

export function ImagensPage() {
  const { http } = useOonApi(); const query = useCatalogs(); const cache = useQueryClient(); const [preview, setPreview] = useState<{ item: Item; url: string }>();
  const upload = useMutation({ mutationFn: async (payload: any) => (await http.post("/api/doc-custom/imagens/upload", payload)).data, onSuccess: () => cache.invalidateQueries({ queryKey: ["doc-custom-catalogs"] }) });
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("arquivo") as File; const conteudo = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); }); upload.mutate({ codigo: form.get("codigo"), descricao: form.get("descricao"), nomeArquivo: file.name, contentType: file.type, conteudo }); }
  async function showPreview(item: Item) { const response = await http.get(`/api/doc-custom/imagens/${item._id}/conteudo`, { responseType: "blob" }); setPreview(previous => { if (previous) URL.revokeObjectURL(previous.url); return { item, url: URL.createObjectURL(response.data as Blob) }; }); }
  function closePreview() { setPreview(previous => { if (previous) URL.revokeObjectURL(previous.url); return undefined; }); }
  return <div><Header title="Imagens" description="Envie os arquivos usados pelos templates; formato e tamanho são identificados automaticamente." />
    <form onSubmit={submit} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, marginBottom: 18 }}><input style={input} name="codigo" placeholder="Código (ex.: logo)" required/><input style={input} name="descricao" placeholder="Descrição" required/><input style={input} name="arquivo" type="file" accept="image/png,image/jpeg,image/gif,image/webp" required/><button style={button}>Enviar</button></form>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>{query.data?.imagens.map(img => <div style={card} key={img._id}><strong>{img.descricao}</strong><p>{img.nomeArquivo} · {(Number(img.tamanho)/1024).toFixed(1)} KB</p><button style={button} onClick={() => showPreview(img)}>Visualizar</button></div>)}</div>
    {preview && <div onClick={closePreview} style={{ position:"fixed", inset:0, background:"#0009", display:"grid", placeItems:"center", zIndex:1000 }}><div style={{...card,maxWidth:"80vw"}} onClick={e=>e.stopPropagation()}><img alt={preview.item.descricao} src={preview.url} style={{maxWidth:"70vw",maxHeight:"70vh"}}/><p><button style={button} onClick={closePreview}>Fechar</button></p></div></div>}
  </div>;
}

export function TemplatesPage() {
  const { http } = useOonApi(); const query = useCatalogs(); const [templateId,setTemplateId]=useState(""); const [baseOmieId,setBase]=useState(""); const [codigoOs,setCodigo]=useState(""); const [result,setResult]=useState<any>();
  const preview = useMutation({ mutationFn: async () => (await http.post(`/api/doc-custom/templates/${templateId}/preview`, { baseOmieId, codigoOs })).data, onSuccess:setResult });
  return <div><Header title="Templates EJS" description="Teste o template com dados reais de uma ordem de serviço Omie antes de usá-lo." />
    <div style={{...card, display:"grid",gridTemplateColumns:"2fr 2fr 1fr auto",gap:12}}><select style={input} value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Selecione o template</option>{query.data?.templates.map(t=><option key={t._id} value={t._id}>{t.descricao} · v{t.versao}</option>)}</select><select style={input} value={baseOmieId} onChange={e=>setBase(e.target.value)}><option value="">Selecione a base Omie</option>{query.data?.bases.map(b=><option key={b._id} value={b._id}>{b.nome}</option>)}</select><input style={input} value={codigoOs} onChange={e=>setCodigo(e.target.value)} placeholder="Código da OS"/><button style={button} disabled={!templateId||!baseOmieId||!codigoOs} onClick={()=>preview.mutate()}>Carregar e visualizar</button></div>
    {result && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:18}}><div style={card}><h2>Documento</h2>{result.html ? <iframe title="Documento gerado" srcDoc={result.html} style={{width:"100%",height:600,border:"1px solid #ddd"}}/> : <pre style={{whiteSpace:"pre-wrap"}}>{result.rendered}</pre>}</div><div style={card}><h2>Variáveis carregadas</h2><pre style={{whiteSpace:"pre-wrap",maxHeight:600,overflow:"auto"}}>{JSON.stringify(result.variables,null,2)}</pre></div></div>}
  </div>;
}

export function DocumentosPage() { const query=useCatalogs(); return <div><Header title="Documentos gerados" description="Documentos criados automaticamente pelos templates e pela esteira de processamento."/><div style={card}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Arquivo</th><th align="left">Template</th><th align="left">Tamanho</th><th align="left">Gerado em</th></tr></thead><tbody>{query.data?.documentos.map(d=><tr key={d._id}><td>{d.nomeArquivo}</td><td>{d.templateCodigo} v{d.templateVersao}</td><td>{(Number(d.tamanho)/1024).toFixed(1)} KB</td><td>{new Date(d.geradoEm).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></div> }
