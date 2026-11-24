(() => {
"use strict";
const API="https://jfs-direct-hub.jhonatan98-furtado98.workers.dev";
const $=id=>document.getElementById(id);
const make=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=String(text);return x;};
let devices=[],events=[],inFlight=false;
function status(text,kind=""){const x=$("jdStatus");x.textContent=text;x.dataset.state=kind;}
async function req(path,body){
 if(!window.JFSNetworkAuth)throw Error("Faça login Google para utilizar o painel.");
 const token=await window.JFSNetworkAuth.getIdToken();
 const r=await fetch(API+path,{method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:"no-store"});
 const j=await r.json().catch(()=>({error:"Resposta inválida"}));
 if(!r.ok)throw Error(j.error||"Falha HTTP "+r.status);
 return j;
}
function refresh(force=false){
 if(inFlight||(!force&&(document.hidden||$("monitorPage")?.hidden||$("monitorRedePanel")?.hidden)))return;
 inFlight=true;
 Promise.all([req("/v2/devices"),req("/v2/events")]).then(([a,b])=>{
    devices=a.devices||[];events=b.events||[];render();status("Central direta conectada","ok");
 }).catch(e=>status("Não foi possível consultar: "+e.message,"error")).finally(()=>{inFlight=false;});
}
function option(sel,value,label){const o=make("option","",label);o.value=value;sel.appendChild(o);}
const actionNames={cancel_job:"Cancelar trabalho",clear_queue:"Limpar fila desta impressora",restart_spooler:"Reiniciar Spooler DESTE PC",reset_spooler:"Reparo avançado DESTE PC"};
function render(){
 const list=$("jdDevices");list.replaceChildren();
 const active=devices.filter(d=>d.online).length;
 const printers=devices.reduce((n,d)=>n+(d.printers?.length||0),0);
 $("jdSummary").textContent=devices.length+" computador(es) · "+active+" conectado(s) · "+printers+" impressora(s)";
 if(!devices.length)list.appendChild(make("p","jd-muted","Nenhum Monitor vinculado. Gere um código para começar."));
 for(const d of devices){
  const card=make("article","jd-card");
  const header=make("div","jd-head");
  const group=make("div");
  group.appendChild(make("strong","",d.name));
  group.appendChild(make("small","",d.id));
  header.append(group,make("span",d.online?"jd-live":"jd-idle",d.online?"Conectado":"Sem relatório recente"));
  card.appendChild(header);
  if(d.warning)card.appendChild(make("p","jd-warning",d.warning));
  const printers=Array.isArray(d.printers)?d.printers:[];
  if(!printers.length)card.appendChild(make("p","jd-muted","Nenhuma impressora informada."));
  for(const p of printers){
    const div=make("div","jd-printer");
    div.appendChild(make("strong","",p.name));
    div.appendChild(make("small","",(p.port||"Porta indefinida")+" · "+(p.presence||p.status||"Não verificado")+" · "+(p.jobs||0)+" trabalho(s)"));
    card.appendChild(div);
  }
  const controls=make("div","jd-actions");
  const allowed=d.remoteEnabled?d.allowedActions||[]:[];
  if(!allowed.length)controls.appendChild(make("p","jd-muted","Reparos desativados neste PC; habilite somente as ações desejadas no Monitor Windows."));
  else{
   const printer=make("select");option(printer,"","Selecione a impressora");
   printers.forEach(x=>option(printer,x.name,x.name));
   const action=make("select");option(action,"","Selecione o reparo");
   allowed.filter(x=>actionNames[x]).forEach(x=>option(action,x,actionNames[x]));
   const job=make("input");job.type="number";job.min=1;job.placeholder="ID do trabalho (para cancelar)";
   const submit=make("button","btn btn-soft btn-small","Reparar apenas este PC");
   submit.disabled=!d.online;
   submit.addEventListener("click",async()=>{
     const a=action.value,p=printer.value,jid=Number(job.value);
     if(!a||!p){status("Escolha a impressora e a ação.","error");return;}
     if(a==="cancel_job"&&(!Number.isSafeInteger(jid)||jid<1)){status("Informe o ID do trabalho.","error");return;}
     const global=a==="restart_spooler"||a==="reset_spooler";
     let warn=global?"Afeta TODAS as impressoras deste computador. ":"";
     if(a==="clear_queue"||a==="reset_spooler")warn+="Pode descartar trabalhos. ";
     const typed=prompt(warn+"Para autorizar "+actionNames[a]+" em "+d.name+", digite exatamente o nome do computador:");
     if(typed!==d.name){if(typed!==null)status("Confirmação recusada.","error");return;}
     submit.disabled=true;
     try{const result=await req("/v2/devices/"+encodeURIComponent(d.id)+"/repair",{action:a,printer:p,jobId:a==="cancel_job"?jid:0,confirmRisk:global,confirmDevice:d.name});
      status("Comando "+result.commandId+" direcionado exclusivamente a "+d.name+". Aguarde o resultado no histórico.","pending");refresh(true);
     }catch(e){status(e.message,"error");}finally{submit.disabled=false;}
   });
   controls.append(printer,action,job,submit);
  }
  const revoke=make("button","btn btn-ghost btn-small","Revogar vínculo deste PC");
  revoke.addEventListener("click",async()=>{
    if(prompt("Para revogar este Monitor, digite "+d.name+":")!==d.name)return;
    revoke.disabled=true;
    try{await req("/v2/devices/"+encodeURIComponent(d.id)+"/revoke",{});status("Vínculo de "+d.name+" revogado.","ok");refresh(true);}
    catch(e){status(e.message,"error");}finally{revoke.disabled=false;}
  });
  controls.appendChild(revoke);card.appendChild(controls);list.appendChild(card);
 }
 const box=$("jdEvents");box.replaceChildren();
 for(const e of events.slice(0,40)){
   const item=make("div","jd-event");
   item.appendChild(make("time","",new Date(e.time).toLocaleString("pt-BR")));
   item.appendChild(make("span","",e.text||e.type));box.appendChild(item);
 }
 if(!events.length)box.appendChild(make("p","jd-muted","Nenhum evento registrado."));
}
async function pairing(){
 const btn=$("jdPair");btn.disabled=true;
 try{const response=await req("/v2/pairings",{});
  $("jdCode").textContent=response.code;$("jdCodeArea").hidden=false;
  status("Código válido por cinco minutos. Digite no Monitor Windows.","pending");
 }catch(e){status(e.message,"error");}finally{btn.disabled=false;}
}
function init(){
 if(!$("jfsDirect"))return;
 $("jdPair").addEventListener("click",pairing);
 $("jdRefresh").addEventListener("click",()=>refresh(true));
 $("jdCopy").addEventListener("click",async()=>{
   try{await navigator.clipboard.writeText($("jdCode").textContent);status("Código copiado.","ok");}
   catch{status("Copie o código manualmente.","error");}
 });
 document.querySelector('[data-monitor-area="rede"]')?.addEventListener("click",()=>setTimeout(()=>refresh(true),200));
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});
 setInterval(refresh,15000);
 setTimeout(()=>refresh(),500);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
