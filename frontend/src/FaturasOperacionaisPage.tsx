import { useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOonApi } from "@oondemand/oon-core-front";

type Item = Record<string, any> & { _id: string };
const btn: CSSProperties = {border:0,borderRadius:8,padding:"8px 11px",background:"#0077b6",color:"#fff",cursor:"pointer",fontWeight:650};
const outline: CSSProperties = {...btn,background:"#fff",color:"#344054",border:"1px solid #d0d5dd"};
const columns = [
  {label:"Aguardando aprovação",stages:["Aprovar processamento"]},
  {label:"Em processamento",stages:["Gerar fatura","Anexar no Omie","Atualizar status Omie"]},
  {label:"Revisar fatura",stages:["Aprovar fatura"]},
  {label:"Pronto para envio",stages:["Enviar e-mail"]},
  {label:"Exceções",stages:["Falha","Rejeitado"]},
  {label:"Concluídas",stages:["Concluido"]},
];

function message(error:any){return error?.response?.data?.message||error?.message||"Não foi possível concluir a operação."}
function status(item:Item){
  if(item.status==="falha")return{label:"Requer atenção",color:"#b42318",bg:"#fef3f2"};
  if(item.status==="rejeitado")return{label:"Reprovada",color:"#b54708",bg:"#fffaeb"};
  if(item.status==="concluido")return{label:"Concluída",color:"#027a48",bg:"#ecfdf3"};
  return{label:item.etapa,color:"#026aa2",bg:"#eff8ff"};
}

function Actions({item,onOpen}:{item:Item;onOpen:()=>void}){
  const {http}=useOonApi();const cache=useQueryClient();const [error,setError]=useState("");
  const action=useMutation({mutationFn:async(kind:string)=>{
    let endpoint=kind;let body:any;
    if(kind==="aprovar")endpoint=item.etapa==="Aprovar processamento"?"aprovar-processamento":"aprovar-fatura";
    if(kind==="reprovar"){const motivo=window.prompt("Informe o motivo da reprovação:");if(!motivo?.trim())throw new Error("__cancel");endpoint="rejeitar";body={motivo};}
    if(kind==="arquivar"&&!window.confirm("Arquivar esta fatura? Ela permanecerá no histórico."))throw new Error("__cancel");
    await http.post("/api/doc-custom/processos/"+encodeURIComponent(item._id)+"/"+endpoint,body);
  },onSuccess:()=>cache.invalidateQueries({queryKey:["processos-operacao"]}),onError:(e:any)=>{if(e?.message!=="__cancel")setError(message(e));}});
  const approval=["Aprovar processamento","Aprovar fatura"].includes(item.etapa);
  return <div style={{display:"grid",gap:5}}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    <button style={outline} onClick={onOpen}>Ver detalhes</button>
    {approval&&<button style={{...btn,background:"#067647"}} disabled={action.isPending} onClick={()=>action.mutate("aprovar")}>Aprovar</button>}
    {approval&&<button style={{...btn,background:"#b42318"}} disabled={action.isPending} onClick={()=>action.mutate("reprovar")}>Reprovar</button>}
    {item.etapa==="Enviar e-mail"&&<button style={{...btn,background:"#067647"}} disabled={action.isPending} onClick={()=>action.mutate("enviar")}>Enviar e-mail</button>}
    {item.etapa==="Falha"&&<button style={{...btn,background:"#b54708"}} disabled={action.isPending} onClick={()=>action.mutate("tentar-novamente")}>Tentar novamente</button>}
    {!item.emailEnviadoEm&&!["concluido","arquivado"].includes(item.status)&&<button style={outline} disabled={action.isPending} onClick={()=>action.mutate("arquivar")}>Arquivar</button>}
  </div>{error&&<small style={{color:"#b42318"}}>{error}</small>}</div>;
}

export function FaturasOperacionaisPage(){
  const {http}=useOonApi();const [view,setView]=useState<"board"|"list">("board");const [selected,setSelected]=useState<Item>();
  const [os,setOs]=useState("");const [cliente,setCliente]=useState("");const [archived,setArchived]=useState(false);
  const query=useQuery({queryKey:["processos-operacao",os,cliente,archived],queryFn:async()=>(await http.get("/api/doc-custom/processos-operacao",{params:{os,cliente,ativos:archived?undefined:"true"}})).data});
  const items:Item[]=query.data?.processos||[];
  const money=(value:any)=>Number(value)>0?new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(value)):"Valor pendente";
  const services=(item:Item)=>Number(item.quantidadeServicos)>0?item.quantidadeServicos+" serviço(s)":"Serviços pendentes";
  const Card=({item}:{item:Item})=>{const state=status(item);return <article style={{background:"#fff",border:"1px solid #e4e7ec",borderRadius:12,padding:14,boxShadow:"0 1px 2px #1018280d",display:"grid",gap:11}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:8}}><div><small style={{color:"#667085",fontWeight:700}}>ORDEM DE SERVIÇO</small><div style={{fontSize:18,fontWeight:800}}>OS {item.numeroOs||item.codigoOs}</div></div><span style={{height:"fit-content",padding:"5px 8px",borderRadius:99,fontSize:11,fontWeight:700,color:state.color,background:state.bg}}>{state.label}</span></div>
    <div><strong>{item.clienteNome||"Cliente aguardando consulta ao Omie"}</strong><div style={{color:"#667085",fontSize:12}}>{item.baseOmieId?.nome||"Base Omie"}</div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"9px 0",borderTop:"1px solid #f2f4f7",borderBottom:"1px solid #f2f4f7"}}><div><small style={{display:"block",color:"#667085"}}>Valor</small><strong>{money(item.valorFatura)}</strong></div><div><small style={{display:"block",color:"#667085"}}>Composição</small><strong>{services(item)}</strong></div></div>
    <Actions item={item} onOpen={()=>setSelected(item)}/></article>};
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:15,flexWrap:"wrap",marginBottom:18}}><div><small style={{color:"#0077b6",fontWeight:800}}>OPERAÇÃO DE FATURAMENTO</small><h1 style={{margin:"5px 0",fontSize:26}}>Faturas para decisão</h1><p style={{margin:0,color:"#667085"}}>Priorize aprovações, revise valores e conclua envios sem navegar por dados técnicos.</p></div><div style={{display:"flex",gap:8}}><button style={view==="board"?btn:outline} onClick={()=>setView("board")}>Fluxo</button><button style={view==="list"?btn:outline} onClick={()=>setView("list")}>Lista operacional</button></div></div>
    <section style={{background:"#fff",border:"1px solid #e4e7ec",borderRadius:12,padding:14,marginBottom:18,display:"flex",gap:10,alignItems:"end",flexWrap:"wrap"}}><label style={{fontSize:12,fontWeight:700}}>OS<input style={{display:"block",marginTop:5,border:"1px solid #d0d5dd",borderRadius:8,padding:10}} value={os} onChange={e=>setOs(e.target.value)} placeholder="Número da OS"/></label><label style={{fontSize:12,fontWeight:700}}>Cliente<input style={{display:"block",marginTop:5,border:"1px solid #d0d5dd",borderRadius:8,padding:10,minWidth:260}} value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Nome do cliente"/></label><button style={outline} onClick={()=>{setOs("");setCliente("")}}>Limpar filtros</button><label style={{fontSize:13,color:"#475467"}}><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Exibir arquivadas</label></section>
    {query.isLoading&&<p>Carregando faturas...</p>}{query.error&&<p style={{color:"#b42318"}}>{message(query.error)}</p>}
    {view==="board"&&!query.isLoading&&<div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(280px,1fr))",gap:12,overflowX:"auto",paddingBottom:12}}>{columns.map(column=>{const records=items.filter(item=>column.stages.includes(item.etapa));return <section key={column.label} style={{background:"#f2f4f7",border:"1px solid #e4e7ec",borderRadius:14,padding:12,minHeight:300}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:11}}><strong style={{fontSize:13,color:"#344054"}}>{column.label.toUpperCase()}</strong><span style={{background:"#0077b6",color:"#fff",borderRadius:99,padding:"3px 8px",fontWeight:700}}>{records.length}</span></div><div style={{display:"grid",gap:10}}>{records.map(item=><Card key={item._id} item={item}/>)}{!records.length&&<div style={{border:"1px dashed #d0d5dd",borderRadius:10,padding:20,textAlign:"center",color:"#98a2b3"}}>Nenhuma fatura</div>}</div></section>})}</div>}
    {view==="list"&&!query.isLoading&&<div style={{background:"#fff",border:"1px solid #e4e7ec",borderRadius:12,overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:"#f9fafb"}}><th align="left" style={{padding:12}}>OS / Cliente</th><th align="left">Valor</th><th align="left">Serviços</th><th align="left">Status</th><th align="left">Base</th><th align="left">Ações</th></tr></thead><tbody>{items.map(item=>{const state=status(item);return <tr key={item._id} style={{borderTop:"1px solid #eaecf0"}}><td style={{padding:12}}><strong>OS {item.numeroOs||item.codigoOs}</strong><div style={{color:"#667085"}}>{item.clienteNome||"Cliente pendente"}</div></td><td><strong>{money(item.valorFatura)}</strong></td><td>{services(item)}</td><td><span style={{padding:"5px 8px",borderRadius:99,color:state.color,background:state.bg,fontSize:11,fontWeight:700}}>{state.label}</span></td><td>{item.baseOmieId?.nome||"-"}</td><td style={{padding:8,minWidth:340}}><Actions item={item} onOpen={()=>setSelected(item)}/></td></tr>})}</tbody></table></div>}
    {selected&&<div style={{position:"fixed",inset:0,zIndex:1200,background:"#10182899",display:"grid",placeItems:"center",padding:16}} onClick={()=>setSelected(undefined)}><div style={{background:"#fff",width:"min(900px,96vw)",maxHeight:"90vh",overflow:"auto",borderRadius:14,padding:20}} onClick={e=>e.stopPropagation()}><div style={{display:"flex",justifyContent:"space-between",gap:15}}><div><small style={{color:"#667085"}}>FATURA · OS {selected.numeroOs||selected.codigoOs}</small><h2 style={{margin:"4px 0"}}>{selected.clienteNome||"Detalhe da fatura"}</h2></div><button style={outline} onClick={()=>setSelected(undefined)}>Fechar</button></div><div style={{margin:"18px 0",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}><div><small>Valor</small><h3>{money(selected.valorFatura)}</h3></div><div><small>Serviços</small><h3>{services(selected)}</h3></div><div><small>Etapa atual</small><h3>{selected.etapa}</h3></div></div><Actions item={selected} onOpen={()=>{}}/></div></div>}
  </div>;
}
