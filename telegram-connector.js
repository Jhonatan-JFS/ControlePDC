/* Telegram no navegador: autenticação MTProto sob demanda.
   Segredos e sessão são cifrados localmente com AES-GCM/PBKDF2.
   Este script não possui credenciais embutidas. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const KEY="controle-pdc-telegram-sessao-cifrada-v1";
  const MONITOR_KEY="controle-pdc-telegram-historico-local-v1";
  const MONITOR_SELECTION_KEY="controle-pdc-telegram-selecao-monitor-v1";
  const encoder=new TextEncoder(), decoder=new TextDecoder();
  const enc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let current=null, myGroups=[], busy=false;
  let activeMonitorGroup="",activeMonitorTopic="all",activeMonitorDirection="enviadas",monitorSettingsOpen=false;
  let draftMonitorGroup="",draftMonitorTopics=[],topicRequestVersion=0;
  const monitorTopicCache=new Map();
  function bytesToBase64(bytes){let str="";for(const b of bytes)str+=String.fromCharCode(b);return btoa(str);}
  function base64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  async function keyFrom(pass,salt){
    const base=await crypto.subtle.importKey("raw",encoder.encode(pass),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:260000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  }
  async function seal(data,pass){
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await keyFrom(pass,salt);
    const payload=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,encoder.encode(JSON.stringify(data))));
    return JSON.stringify({version:1,salt:bytesToBase64(salt),iv:bytesToBase64(iv),data:bytesToBase64(payload)});
  }
  async function open(pass){
    const raw=localStorage.getItem(KEY);
    if(!raw)throw new Error("Não existe sessão salva neste navegador.");
    const blob=JSON.parse(raw);
    const salt=base64ToBytes(blob.salt),iv=base64ToBytes(blob.iv),cipher=base64ToBytes(blob.data);
    try{
      const key=await keyFrom(pass,salt);
      const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher);
      return JSON.parse(decoder.decode(plain));
    }catch(_){throw new Error("Senha local incorreta ou sessão corrompida.");}
  }
  function logged(){return !!current&&!!window.TelegramBridge?.connected?.();}
  function groups(){return myGroups.map(g=>({...g}));}
  async function topics(groupId){
    if(!logged())throw new Error("Conecte a conta para listar os tópicos.");
    const selected=myGroups.find(g=>g.id===groupId);
    if(!selected)throw new Error("Grupo não encontrado. Atualize os grupos em Configurações.");
    if(!selected.isForum)return [];
    return window.TelegramBridge.topics(groupId);
  }
  async function ask(kind,info){
    const labels={
      phone:"Número do Telegram (com DDI +55)",code:"Código de autenticação recebido no Telegram",
      password:"Senha de verificação em duas etapas",email:"E-mail solicitado pelo Telegram",
      emailCode:"Código recebido por e-mail"
    };
    const dialog=document.createElement("dialog");
    dialog.className="tg-auth-dialog";
    const label=labels[kind]||"Informação de autenticação";
    dialog.innerHTML='<form method="dialog"><h3>'+enc(label)+'</h3><p>Informe este dado somente aqui, na página do seu site. Não envie por chat.</p><input id="tgAskValue" required autocomplete="off" '+(kind==="password"?'type="password"':'type="text"')+' placeholder="'+enc(kind==="code"?'Código de confirmação':"")+'"><div class="tg-auth-dialog-buttons"><button type="button" id="tgAskCancel" class="btn btn-ghost">Cancelar</button><button type="submit" class="btn btn-primary">Continuar</button></div></form>';
    document.body.appendChild(dialog);
    return new Promise((resolve,reject)=>{
      const form=dialog.querySelector("form"),input=dialog.querySelector("input");
      const finish=(value,error)=>{dialog.close();dialog.remove();error?reject(error):resolve(value);};
      dialog.querySelector("#tgAskCancel").addEventListener("click",()=>finish("",new Error("Autenticação cancelada.")));
      dialog.addEventListener("cancel",e=>{e.preventDefault();finish("",new Error("Autenticação cancelada."));});
      form.addEventListener("submit",e=>{e.preventDefault();const value=input.value.trim();if(value)finish(value);});
      dialog.showModal();input.focus();
    });
  }
  function setNote(txt,error=false){
    const el=$("tgConnectStatus");if(!el)return;
    el.textContent=txt;el.classList.toggle("error",error);
  }
  function statusMarkup(){
    const saved=!!localStorage.getItem(KEY);
    if(logged()){
      return '<div class="tg-auth-ok"><strong>✓ Conta Telegram conectada</strong><p>'+enc(current.name||"Conta autorizada")+'</p><p>Esta conexão funciona enquanto o site estiver aberto. Ao voltar, desbloqueie sua sessão local para sincronizar as mensagens acumuladas.</p></div>'+
        '<div class="tg-auth-actions"><button type="button" class="btn btn-soft" id="tgRefreshGroups">Atualizar lista de grupos</button><button type="button" class="btn btn-ghost" id="tgDisconnect">Desconectar deste site</button><button type="button" class="btn btn-ghost" id="tgForget">Esquecer sessão local</button></div>';
    }
    return saved ?
      '<label>Senha local para desbloquear a sessão<input id="tgUnlockPass" type="password" autocomplete="current-password" placeholder="Sua senha de proteção local"></label><button type="button" id="tgConnect" class="btn btn-primary">Desbloquear e conectar</button><button type="button" id="tgForget" class="btn btn-ghost btn-small">Esquecer sessão deste navegador</button>' :
      '<div class="tg-fields"><label>API ID<input type="number" id="tgApiId" inputmode="numeric" autocomplete="off" placeholder="API ID"></label><label>API hash<input id="tgApiHash" type="password" autocomplete="off" placeholder="API hash gerado pelo Telegram"></label><label>Número com DDI<input id="tgPhone" autocomplete="tel" placeholder="+55..."></label><label>Senha local para proteger a sessão<input id="tgNewPass" type="password" autocomplete="new-password" placeholder="Mínimo de 12 caracteres"></label></div><button type="button" id="tgConnect" class="btn btn-primary">Conectar conta Telegram</button>';
  }
  function renderLogin(){
    const mount=$("tgAuthMount");if(!mount)return;
    mount.innerHTML='<section class="tg-auth-box"><h4>Acesso à sua conta Telegram</h4><p>Conexão diretamente do navegador, sem bot e sem servidor permanente. Obtenha seu API ID e API hash em <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer">my.telegram.org</a>. A sessão fica cifrada neste dispositivo.</p>'+statusMarkup()+'<p class="tg-auth-message" id="tgConnectStatus" role="status" aria-live="polite"></p></section>';
  }
  async function connect(){
    if(busy)return;
    if(!window.TelegramBridge){setNote("O módulo de conexão não carregou. Atualize a página.",true);return;}
    const previouslySaved=!!localStorage.getItem(KEY);
    const pass=previouslySaved?($("tgUnlockPass")?.value||""):($("tgNewPass")?.value||"");
    if(pass.length<12)return setNote("Informe uma senha local de pelo menos 12 caracteres.",true);
    let data;
    if(previouslySaved){
      try{data=await open(pass);}catch(e){setNote(e.message,true);return;}
    }else{
      data={apiId:($("tgApiId")?.value||"").trim(),apiHash:($("tgApiHash")?.value||"").trim(),phone:($("tgPhone")?.value||"").trim(),session:""};
      if(!/^\d{3,}$/.test(data.apiId)||!data.apiHash||!data.phone)return setNote("Preencha API ID, API hash e número com DDI.",true);
    }
    busy=true;setNote("Conectando ao Telegram…");
    try{
      const profile=await window.TelegramBridge.connect({...data,ask,onError:e=>{setNote("Telegram: "+String(e?.message||e),true);}});
      data.session=profile.session;
      delete data.phone;
      const encrypted=await seal(data,pass);
      localStorage.setItem(KEY,encrypted);
      current=profile;
      try{myGroups=await window.TelegramBridge.groups();}catch(_){myGroups=[];}
      renderLogin();
      monitorTopicCache.clear();
      window.dispatchEvent(new CustomEvent("tg-connection-changed",{detail:{connected:true}}));
      setNote("Conectado. "+myGroups.length+" grupos/canais encontrados.");
    }catch(e){setNote("Não foi possível conectar: "+String(e.message||e),true);}
    finally{busy=false;}
  }
  async function disconnect(forget=false){
    if(window.TelegramBridge?.connected?.())await window.TelegramBridge.disconnect();
    if(forget)localStorage.removeItem(KEY);
    current=null;myGroups=[];
    renderLogin();
    monitorTopicCache.clear();
    window.dispatchEvent(new CustomEvent("tg-connection-changed",{detail:{connected:false}}));
    setNote(forget?"Sessão local esquecida.":"Conexão encerrada neste navegador.");
  }
  async function reloadGroups(){
    if(!logged())return setNote("Conecte a conta primeiro.",true);
    try{setNote("Consultando grupos…");myGroups=await window.TelegramBridge.groups();monitorTopicCache.clear();setNote(myGroups.length+" grupos/canais encontrados.");window.dispatchEvent(new Event("tg-groups-updated"));}
    catch(e){setNote(String(e.message||e),true);}
  }
  function readMonitorSelection(){
    try{
      const saved=JSON.parse(localStorage.getItem(MONITOR_SELECTION_KEY)||"{}");
      const list=Array.isArray(saved.groups)?saved.groups:[];
      const ids=new Set();
      const selected=[];
      for(const entry of list.slice(0,100)){
        if(!entry||typeof entry.id!=="string"||!entry.id||ids.has(entry.id))continue;
        ids.add(entry.id);
        const topics=Array.isArray(entry.topics)?entry.topics.filter(t=>t&&typeof t.id==="string"&&/^\d+$/.test(t.id)).slice(0,500):[];
        selected.push({
          id:entry.id,name:String(entry.name||entry.id).slice(0,120),
          isForum:!!entry.isForum,
          topics:[...new Map(topics.map(t=>[t.id,{id:t.id,name:String(t.name||t.id).slice(0,120)}])).values()]
        });
      }
      return {groups:selected};
    }catch(_){return {groups:[]};}
  }
  function saveMonitorSelection(config){
    try{
      localStorage.setItem(MONITOR_SELECTION_KEY,JSON.stringify({groups:config.groups}));
      return true;
    }catch(_){throw new Error("Não foi possível salvar os grupos monitorados neste navegador.");}
  }
  function selectedTargets(){
    const saved=readMonitorSelection(),targets=[];
    for(const selected of saved.groups){
      const actual=myGroups.find(g=>g.id===selected.id);
      if(!actual)continue;
      if(actual.isForum){
        for(const thread of selected.topics){
          targets.push({telegramId:actual.id,telegramName:actual.name,topicId:thread.id,topicName:thread.name,name:actual.name+" / "+thread.name,isForum:true});
        }
      }else{
        targets.push({telegramId:actual.id,telegramName:actual.name,topicId:null,topicName:"",name:actual.name,isForum:false});
      }
    }
    return targets;
  }
  function monitorScope(){
    const selection=readMonitorSelection();
    if(!selection.groups.some(g=>g.id===activeMonitorGroup)){
      activeMonitorGroup=selection.groups[0]?.id||"";
      activeMonitorTopic="all";
    }
    return {selection,group:selection.groups.find(g=>g.id===activeMonitorGroup)||null};
  }
  function matchesMonitorScope(record,group,topic){
    if(!group||record.telegramId!==group.id)return false;
    if(!group.isForum)return true;
    const id=record.topicId==null?"":String(record.topicId);
    if(!group.topics.some(t=>t.id===id))return false;
    return topic==="all"||topic===id;
  }
  function readHistory(){
    try{
      const data=JSON.parse(localStorage.getItem(MONITOR_KEY)||"{}");
      return {cursors:data.cursors&&typeof data.cursors==="object"?data.cursors:{},records:Array.isArray(data.records)?data.records:[]};
    }catch(_){return {cursors:{},records:[]};}
  }
  function writeHistory(state){
    try{localStorage.setItem(MONITOR_KEY,JSON.stringify(state));return true;}
    catch(_){throw new Error("O navegador ficou sem espaço para o histórico. Faça backup antes de continuar.");}
  }
  function directionOf(m,ownId){
    return m.out || (ownId && String(m.senderId||"")===String(ownId))?"enviadas":"recebidas";
  }
  function recordDirection(record){
    // Compatibilidade com o histórico das versões anteriores, sem alterar os registros antigos.
    return record.direction==="enviadas"||record.direction==="recebidas"
      ?record.direction
      :record.kind==="solicitacao"||!record.kind?"enviadas":"recebidas";
  }
  function recognize(m,ownId){
    if(directionOf(m,ownId)==="enviadas")return "solicitacao";
    const txt=String(m.text||"");
    if(/\b(?:aumentou|abaixou|baixou|subiu)\s*(?:para)?\s*(?:R\$\s*)?\d+[.,]\d{2}/i.test(txt))return "preco";
    if(/\bproduto(?:s)?\s+novo(?:s)?\b/i.test(txt))return "produto";
    return "recebida";
  }
  function insertMessage(state,g,m,kind,direction){
    const key=g.telegramId+":"+m.id;
    let rec=state.records.find(x=>x.key===key);
    const now=new Date().toISOString();
    if(!rec){
      const sent=direction==="enviadas",status=sent?(m.reactionCount>0?"conferido":"pendente"):"informativo";
      rec={key,telegramId:g.telegramId,topicId:m.topicId??g.topicId??null,topicName:g.topicName||"",group:g.telegramName||g.name,
        messageId:m.id,date:m.date,text:String(m.text||""),kind,direction,senderId:String(m.senderId||""),
        reactionCount:sent?(m.reactionCount||0):0,reactions:sent?(m.reactions||[]):[],
        status,history:[{at:now,status,reason:"Primeira leitura"}]};
      state.records.push(rec);
    }else {
      rec.text=String(m.text??rec.text??"");
      rec.date=m.date||rec.date;
      rec.direction=direction;rec.kind=kind;rec.senderId=String(m.senderId||rec.senderId||"");
      if(m.topicId!=null)rec.topicId=m.topicId;
      if(g.topicName)rec.topicName=g.topicName;
    }
    return rec;
  }
  function applyReaction(rec,m){
    if(m.missing){rec.unavailable=true;return;}
    rec.unavailable=false;
    const count=Number(m.reactionCount||0),status=count>0?"conferido":"pendente";
    if(status!==rec.status){
      rec.history ||= [];
      rec.history.push({at:new Date().toISOString(),status,reason:status==="pendente"?"Todas as reações foram removidas":"Reação encontrada"});
    }
    rec.status=status;rec.reactionCount=count;rec.reactions=m.reactions||[];
    rec.verifiedAt=new Date().toISOString();
  }
  async function synchronize(){
    if(!logged())throw new Error("Conecte sua conta Telegram para sincronizar.");
    const targets=selectedTargets();
    if(!targets.length)throw new Error("Escolha os grupos e tópicos em Monitoramento → Configurar monitoramento.");
    const db=readHistory(),errors=[],meId=window.TelegramBridge.getMeId();
    let added=0,checked=0;
    for(const group of targets){
      try{
        let pages=0,more=true;
        while(more&&pages<8){
          const cursorKey=group.telegramId+":topic:"+(group.topicId??"all");
          const cursor=Number((db.cursors[cursorKey]??(group.topicId==null?db.cursors[group.telegramId]:0))||0);
          const page=await window.TelegramBridge.scan(group.telegramId,cursor,1200,group.topicId??null);
          for(const msg of page.messages){
            const direction=directionOf(msg,meId),kind=recognize(msg,meId);
            const key=group.telegramId+":"+msg.id;
            if(!db.records.some(r=>r.key===key))added++;
            insertMessage(db,group,msg,kind,direction);
          }
          db.cursors[cursorKey]=Math.max(cursor,page.lastId);
          writeHistory(db);
          more=page.truncated;pages++;
        }
        if(more)errors.push(group.name+": há mais mensagens para recuperar. Sincronize novamente.");
        const records=db.records.filter(r=>r.telegramId===group.telegramId &&
          (group.topicId==null || String(r.topicId??"")===String(group.topicId)) &&
          recordDirection(r)==="enviadas");
        for(let i=0;i<records.length;i+=50){
          const chunk=records.slice(i,i+50),reactionData=await window.TelegramBridge.reactions(group.telegramId,chunk.map(x=>x.messageId));
          const byId=new Map(reactionData.map(x=>[x.id,x]));
          for(const rec of chunk){const latest=byId.get(rec.messageId);if(latest){applyReaction(rec,latest);checked++;}}
          writeHistory(db);
        }
      }catch(e){errors.push(group.name+": "+String(e.message||e));}
    }
    db.lastSync=new Date().toISOString();writeHistory(db);
    return {added,checked,total:db.records.length,errors};
  }
  function extract(text){
    const lines=String(text||"").split(/\r?\n/),items=[];
    for(const raw of lines){
      const line=raw.trim();
      const match=line.match(/^(\d{2,16})\s*[-–]\s*(.+)$/);
      if(match){items.push({ci:match[1],name:match[2],cb:""});continue;}
      const cb=line.match(/^CB:\s*(\S+)/i);
      if(cb && items.length)items[items.length-1].cb=cb[1];
    }
    return items;
  }

  function monitorConfigHtml(selection){
    const selected=selection.groups;
    const current=draftMonitorGroup;
    const options=myGroups.map(g=>'<option value="'+enc(g.id)+'"'+(g.id===current?' selected':'')+'>'+enc(g.name)+(g.isForum?' · tópicos':'')+'</option>').join("");
    const list=selected.length?selected.map(g=>{
      const summary=g.isForum?(g.topics.map(t=>t.name).join(", ")||"Nenhum tópico"):"Conversa inteira";
      return '<div class="tg-mon-configured"><div><strong>'+enc(g.name)+'</strong><small>'+enc(summary)+'</small></div>'+
        '<div class="tg-mon-row-actions"><button type="button" class="btn btn-soft btn-small" data-mon-edit="'+enc(g.id)+'">Editar</button>'+
        '<button type="button" class="btn btn-ghost btn-small" data-mon-remove="'+enc(g.id)+'">Retirar</button></div></div>';
    }).join(""):'<p class="tg-muted">Nenhum grupo selecionado. Escolha abaixo o que deseja acompanhar.</p>';
    return '<section class="tg-monitor-settings" aria-label="Configuração do monitoramento">'+
      '<div class="tg-mon-config-heading"><strong>Grupos e tópicos monitorados</strong><span>Independente dos destinos de envio</span></div>'+
      '<div class="tg-mon-selection-list">'+list+'</div>'+
      (logged()?'<div class="tg-mon-new-selection"><label for="tgMonGroupPick">Escolha um grupo do Telegram</label>'+
       '<select id="tgMonGroupPick"><option value="">Selecionar grupo…</option>'+options+'</select>'+
       '<div id="tgMonTopicOptions"><p class="tg-muted">Selecione o grupo para configurar seus tópicos.</p></div>'+
       '<button type="button" class="btn btn-primary btn-small" id="tgMonSaveGroup">Salvar grupo e tópicos</button></div>':
       '<p class="tg-muted">Conecte sua conta em Telegram → Configurações para selecionar novos grupos.</p>')+
      '<p class="tg-mon-helper">Desmarcar um grupo interrompe novas leituras, mas não apaga o histórico local. Os modelos e seus destinos de envio continuam iguais.</p></section>';
  }
  function monitorHtml(){
    const {selection,group}=monitorScope(),db=readHistory();
    if(!selection.groups.length)monitorSettingsOpen=true;
    if(group&&activeMonitorTopic!=="all"&&!group.topics.some(t=>t.id===activeMonitorTopic))activeMonitorTopic="all";
    const records=group?db.records.filter(r=>matchesMonitorScope(r,group,activeMonitorTopic))
      .sort((a,b)=>new Date(b.date)-new Date(a.date)):[];
    const requests=records.filter(r=>r.kind==="solicitacao"||!r.kind);
    const verified=requests.filter(r=>r.status==="conferido"&&!r.unavailable).length;
    const pending=requests.filter(r=>r.status==="pendente"&&!r.unavailable).length;
    const totalSources=selection.groups.reduce((count,g)=>count+(g.isForum?g.topics.length:1),0);
    const metric=(title,value,tone,note)=>'<div class="tg-stat" data-tone="'+tone+'"><div class="tg-stat-label">'+title+'</div><strong class="tg-stat-value">'+value+'</strong><div class="tg-stat-note">'+note+'</div></div>';
    const tabs='<nav class="tg-monitor-tabs" aria-label="Grupos monitorados">'+selection.groups.map(g=>{
      const selected=g.id===activeMonitorGroup;
      return '<button type="button" class="tg-monitor-tab'+(selected?' active':'')+'" data-mon-tab="'+enc(g.id)+'" aria-current="'+(selected?'page':'false')+'">'+enc(g.name)+'</button>';
    }).join("")+'</nav>';
    const topics=group?.isForum?'<nav class="tg-monitor-topics" aria-label="Tópicos do grupo selecionado">'+
      '<button type="button" class="tg-monitor-topic'+(activeMonitorTopic==="all"?' active':'')+'" data-mon-filter="all">Todos os tópicos escolhidos</button>'+
      group.topics.map(t=>'<button type="button" class="tg-monitor-topic'+(activeMonitorTopic===t.id?' active':'')+'" data-mon-filter="'+enc(t.id)+'">'+enc(t.name)+'</button>').join("")+'</nav>':"";
    const top='<div class="tg-monitor-controls"><div><strong>Monitoramento por grupo</strong><p>Alterne entre os grupos para ver apenas suas mensagens.</p></div>'+
      '<button type="button" id="tgMonToggleConfig" class="btn btn-soft btn-small" aria-expanded="'+monitorSettingsOpen+'">⚙ Selecionar grupos e tópicos</button></div>';
    const stats='<section class="tg-stats" aria-label="Indicadores da aba selecionada">'+
      metric("Mensagens exibidas",records.length,"info",group?"Grupo atual":"Nenhum grupo")+
      metric("Conferidas",verified,"success","Com reação na última leitura")+
      metric("Não conferidas",pending,"warning","Sem reação na última leitura")+
      metric("Fontes monitoradas",totalSources,"info","Grupos / tópicos selecionados")+'</section>';
    const sync='<div class="tg-monitor-head"><div><strong>'+records.length+' mensagem(ns) nesta aba</strong><small>Última sincronização: '+(db.lastSync?enc(new Date(db.lastSync).toLocaleString("pt-BR")):"nunca")+'</small></div>'+
      '<button type="button" class="btn btn-primary btn-small" id="tgSyncNow"'+(!selection.groups.length?' disabled':'')+'>↻ Sincronizar selecionados</button></div>';
    const status='<p class="tg-auth-message" id="tgMonitorStatus" role="status" aria-live="polite">'+
      (!logged()?"Conecte sua conta em Configurações.":!selection.groups.length?"Configure quais grupos e tópicos acompanhar.":"A sincronização consulta apenas as fontes escolhidas, incluindo reações antigas.")+'</p>';
    const content=records.length?'<div class="tg-records">'+records.map(rec=>{
      const parsed=extract(rec.text);
      const label=rec.unavailable?"Mensagem indisponível":rec.kind==="preco"?"Atualização de preço":
        rec.kind==="produto"?"Produto novo":rec.status==="conferido"?"Conferido":"Não conferido";
      const block=parsed.length?parsed.map(p=>'<div class="tg-monitor-item"><strong>'+enc(p.ci)+' - '+enc(p.name)+'</strong>'+(p.cb?'<small>CB: '+enc(p.cb)+'</small>':'')+'</div>').join(""):'<pre>'+enc(rec.text)+'</pre>';
      return '<article class="tg-record"><div class="tg-record-top"><strong>'+enc(rec.group)+(rec.topicName?' · '+enc(rec.topicName):'')+'</strong>'+
        '<span class="tg-rec-state '+(rec.status==="conferido"&&!rec.unavailable?"ok":"")+'">'+enc(label)+'</span></div>'+
        '<small>'+enc(new Date(rec.date).toLocaleString("pt-BR"))+' · Mensagem #'+enc(rec.messageId)+'</small>'+
        '<div class="tg-record-content">'+block+'</div><small>'+(rec.reactionCount||0)+' reação(ões) · '+(rec.history?.length||0)+' evento(s) registrados</small></article>';
    }).join("")+'</div>':'<div class="tg-information"><strong>Nenhuma mensagem nesta visualização.</strong><p>'+
      (!group?"Configure um grupo para começar.":"Ainda não há registros deste grupo e tópico no histórico local. Use Sincronizar selecionados.")+'</p></div>';
    return top+(monitorSettingsOpen?monitorConfigHtml(selection):"")+tabs+topics+stats+sync+status+content;
  }
  async function renderMonitorTopicChoices(){
    const mount=$("tgMonTopicOptions"),select=$("tgMonGroupPick");
    if(!mount||!select)return;
    const id=select.value,actual=myGroups.find(g=>g.id===id);
    if(!actual){mount.innerHTML='<p class="tg-muted">Escolha um grupo da lista.</p>';return;}
    if(!actual.isForum){mount.innerHTML='<div class="tg-mon-whole-group"><strong>Grupo sem tópicos</strong><p>As mensagens desta conversa serão acompanhadas.</p></div>';return;}
    const version=++topicRequestVersion;
    mount.innerHTML='<p class="tg-muted">Buscando tópicos do grupo…</p>';
    try{
      let available=monitorTopicCache.get(id);
      if(!available){available=await topics(id);monitorTopicCache.set(id,available);}
      if(version!==topicRequestVersion||$("tgMonGroupPick")?.value!==id)return;
      if(!available.length){mount.innerHTML='<p class="tg-auth-message error">Nenhum tópico encontrado. Confira as permissões do grupo.</p>';return;}
      const previously=readMonitorSelection().groups.find(g=>g.id===id);
      const enabled=new Set(draftMonitorGroup===id?draftMonitorTopics:previously?.topics.map(t=>t.id)||[]);
      mount.innerHTML='<fieldset class="tg-mon-topic-fieldset"><legend>Tópicos que deseja monitorar</legend>'+
        '<div class="tg-mon-topic-helpers"><button type="button" class="btn btn-ghost btn-small" id="tgMonSelectAll">Selecionar todos</button>'+
        '<button type="button" class="btn btn-ghost btn-small" id="tgMonClearTopics">Limpar seleção</button></div>'+
        '<div class="tg-mon-topic-grid">'+available.map(t=>'<label class="tg-mon-topic-choice"><input type="checkbox" data-mon-topic="'+enc(t.id)+'"'+(enabled.has(t.id)?' checked':'')+'><span>'+enc(t.name)+'</span></label>').join("")+'</div></fieldset>';
    }catch(e){mount.innerHTML='<p class="tg-auth-message error">Não foi possível carregar tópicos: '+enc(e.message||e)+'</p>';}
  }
  function renderMonitor(){
    const mount=$("tgMonitorMount");
    if(!mount)return;
    mount.innerHTML=monitorHtml();
    if(monitorSettingsOpen&&draftMonitorGroup){
      const picker=$("tgMonGroupPick");
      if(picker)picker.value=draftMonitorGroup;
      renderMonitorTopicChoices();
    }
  }
  document.addEventListener("change",e=>{
    const el=e.target;
    if(el.id==="tgMonGroupPick"){
      draftMonitorGroup=el.value;
      draftMonitorTopics=readMonitorSelection().groups.find(g=>g.id===el.value)?.topics.map(t=>t.id)||[];
      renderMonitorTopicChoices();
    }
    if(el.matches?.("[data-mon-topic]")){
      draftMonitorTopics=Array.from(document.querySelectorAll("[data-mon-topic]:checked")).map(x=>x.dataset.monTopic);
    }
  });
  document.addEventListener("click",async e=>{
    if(e.target.closest("#tgMonToggleConfig")){
      monitorSettingsOpen=!monitorSettingsOpen;draftMonitorGroup="";draftMonitorTopics=[];renderMonitor();return;
    }
    const tab=e.target.closest("[data-mon-tab]");
    if(tab){activeMonitorGroup=tab.dataset.monTab;activeMonitorTopic="all";renderMonitor();return;}
    const filter=e.target.closest("[data-mon-filter]");
    if(filter){activeMonitorTopic=filter.dataset.monFilter;renderMonitor();return;}
    const remove=e.target.closest("[data-mon-remove]");
    if(remove){
      const config=readMonitorSelection(),g=config.groups.find(g=>g.id===remove.dataset.monRemove);
      if(!g||!confirm("Retirar "+g.name+" do monitoramento? Os vínculos de envio e o histórico serão preservados."))return;
      config.groups=config.groups.filter(x=>x.id!==g.id);
      try{saveMonitorSelection(config);}catch(err){alert(err.message);return;}
      if(activeMonitorGroup===g.id){activeMonitorGroup=config.groups[0]?.id||"";activeMonitorTopic="all";}
      draftMonitorGroup="";draftMonitorTopics=[];renderMonitor();return;
    }
    const edit=e.target.closest("[data-mon-edit]");
    if(edit){
      const g=readMonitorSelection().groups.find(x=>x.id===edit.dataset.monEdit);
      if(!g)return;
      monitorSettingsOpen=true;draftMonitorGroup=g.id;draftMonitorTopics=g.topics.map(t=>t.id);
      renderMonitor();return;
    }
    if(e.target.closest("#tgMonSelectAll")||e.target.closest("#tgMonClearTopics")){
      const checked=!!e.target.closest("#tgMonSelectAll");
      document.querySelectorAll("[data-mon-topic]").forEach(x=>{x.checked=checked;});
      draftMonitorTopics=Array.from(document.querySelectorAll("[data-mon-topic]:checked")).map(x=>x.dataset.monTopic);
      return;
    }
    if(e.target.closest("#tgMonSaveGroup")){
      const id=$("tgMonGroupPick")?.value||"",g=myGroups.find(x=>x.id===id);
      if(!g){alert("Selecione um grupo do Telegram.");return;}
      const available=monitorTopicCache.get(id)||[];
      const check=Array.from(document.querySelectorAll("[data-mon-topic]:checked")).map(x=>x.dataset.monTopic);
      const topicsChosen=g.isForum?available.filter(t=>check.includes(t.id)):[];
      if(g.isForum&&!topicsChosen.length){alert("Escolha ao menos um tópico desse grupo.");return;}
      const entry={id:g.id,name:g.name,isForum:!!g.isForum,topics:topicsChosen.map(t=>({id:String(t.id),name:String(t.name)}))};
      const config=readMonitorSelection(),index=config.groups.findIndex(x=>x.id===id);
      if(index<0)config.groups.push(entry);else config.groups[index]=entry;
      try{saveMonitorSelection(config);}catch(err){alert(err.message);return;}
      activeMonitorGroup=id;activeMonitorTopic="all";draftMonitorGroup="";draftMonitorTopics=[];
      renderMonitor();return;
    }

    if(e.target.closest("#tgConnect")){await connect();return;}
    if(e.target.closest("#tgDisconnect")){await disconnect();return;}
    if(e.target.closest("#tgForget")){if(confirm("Esquecer a sessão local neste dispositivo? A autorização pode ser revogada também em Telegram > Dispositivos."))await disconnect(true);return;}
    if(e.target.closest("#tgRefreshGroups")){await reloadGroups();return;}
    if(e.target.closest("#tgSyncNow")){
      const status=$("tgMonitorStatus");if(status)status.textContent="Consultando mensagens e reações…";
      try{
        const result=await synchronize();renderMonitor();
        const el=$("tgMonitorStatus");if(el)el.textContent="Sincronização concluída: "+result.added+" novas, "+result.checked+" verificadas. "+(result.errors.length?"Atenção: "+result.errors.join(" | "):"");
      }catch(err){if(status)status.textContent=String(err.message||err);}
    }
  });
  window.addEventListener("tg-connection-changed",renderMonitor);
  window.addEventListener("tg-groups-updated",renderMonitor);
  window.TelegramConnector={
    connected:logged,
    groups,
    topics,
    reloadGroups,
    send:async(groupId,text,topicId=null)=>{if(!logged())throw new Error("Conecte sua conta.");return window.TelegramBridge.send(groupId,text,topicId);},
    renderLogin,renderMonitor,synchronize,readHistory
  };
})();
