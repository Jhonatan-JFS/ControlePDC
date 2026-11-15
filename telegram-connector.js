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
  let current=null, myGroups=[], busy=false, syncRunning=false;
  let activeMonitorGroup="",activeMonitorTopic="all",activeMonitorDirection="enviadas",activeReceivedCategory="todas",monitorSettingsOpen=false,monitorReportOpen=false;
  let syncConfigTarget="all",syncNotice="",syncNoticeError=false;
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
    mount.innerHTML='<section class="tg-auth-box"><h4>Acesso à sua conta Telegram</h4><p>Conexão diretamente do navegador, sem bot e sem servidor permanente. Obtenha seu API ID e API hash em <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer">my.telegram.org</a>. A sessão fica cifrada neste dispositivo.</p>'+statusMarkup()+'<p class="tg-auth-message" id="tgConnectStatus" role="status" aria-live="polite"></p></section><div id="tgSyncSettingsMount"></div>';
    renderSyncSettings();
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
          isForum:!!entry.isForum,startAt:typeof entry.startAt==="string"?entry.startAt:"",
          topics:[...new Map(topics.map(t=>[t.id,{id:t.id,name:String(t.name||t.id).slice(0,120),startAt:typeof t.startAt==="string"?t.startAt:""}])).values()]
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
          targets.push({telegramId:actual.id,telegramName:actual.name,topicId:thread.id,topicName:thread.name,name:actual.name+" / "+thread.name,isForum:true,startAt:thread.startAt||selected.startAt||""});
        }
      }else{
        targets.push({telegramId:actual.id,telegramName:actual.name,topicId:null,topicName:"",name:actual.name,isForum:false,startAt:selected.startAt||""});
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
  function startDateFor(group,topic){
    if(!group)return "";
    if(!group.isForum||topic==="all")return group.startAt||"";
    return group.topics.find(t=>t.id===topic)?.startAt||group.startAt||"";
  }
  function localDateInput(iso){
    if(!iso)return "";
    const date=new Date(iso);
    if(!Number.isFinite(date.getTime()))return "";
    const part=v=>String(v).padStart(2,"0");
    return date.getFullYear()+"-"+part(date.getMonth()+1)+"-"+part(date.getDate())+"T"+part(date.getHours())+":"+part(date.getMinutes());
  }
  function saveStartDate(raw,scope="current"){
    const date=new Date(raw),ms=date.getTime();
    if(!raw||!Number.isFinite(ms))throw new Error("Informe uma data e hora válidas.");
    if(ms>Date.now()+60000)throw new Error("A data inicial não pode ser futura.");
    const iso=date.toISOString();
    const config=readMonitorSelection();
    if(scope==="all"){
      for(const group of config.groups){
        group.startAt=iso;
        for(const topic of group.topics)topic.startAt=iso;
      }
    }else{
      const group=config.groups.find(g=>g.id===activeMonitorGroup);
      if(!group)throw new Error("Escolha o grupo primeiro.");
      if(!group.isForum||activeMonitorTopic==="all"){
        group.startAt=iso;
        for(const topic of group.topics)topic.startAt=iso;
      }else{
        const topic=group.topics.find(t=>t.id===activeMonitorTopic);
        if(!topic)throw new Error("Escolha um tópico válido.");
        topic.startAt=iso;
      }
    }
    saveMonitorSelection(config);
    return iso;
  }
  // A configuração fica ao lado da conexão Telegram, independente da aba
  // escolhida no Monitoramento. O histórico e os cursores não são apagados.
  function syncOptions(){
    const selection=readMonitorSelection(),options=[];
    for(const group of selection.groups){
      if(group.isForum){
        for(const topic of group.topics){
          options.push({key:group.id+":topic:"+topic.id,group:group.name,topic:topic.name,
            name:group.name+" / "+topic.name,startAt:topic.startAt||group.startAt||""});
        }
      }else{
        options.push({key:group.id+":topic:all",group:group.name,topic:"",
          name:group.name,startAt:group.startAt||""});
      }
    }
    return options;
  }
  function saveSyncStart(raw,key){
    if(key==="all")return saveStartDate(raw,"all");
    const date=new Date(raw),ms=date.getTime();
    if(!raw||!Number.isFinite(ms))throw new Error("Selecione uma data e hora válidas.");
    if(ms>Date.now()+60000)throw new Error("A data inicial não pode ser futura.");
    const config=readMonitorSelection(),option=syncOptions().find(t=>t.key===key);
    if(!option)throw new Error("Selecione um grupo/tópico monitorado válido.");
    const iso=date.toISOString();
    const group=config.groups.find(g=>key.startsWith(g.id+":topic:"));
    if(!group)throw new Error("Grupo não encontrado.");
    if(group.isForum){
      const topic=group.topics.find(t=>key===group.id+":topic:"+t.id);
      if(!topic)throw new Error("Tópico não encontrado.");
      topic.startAt=iso;
    }else group.startAt=iso;
    saveMonitorSelection(config);
    return iso;
  }
  function lastMessageFor(option,db){
    const groupId=option.key.slice(0,option.key.lastIndexOf(":topic:"));
    const threadId=option.key.slice(option.key.lastIndexOf(":topic:")+7);
    let max=0;
    for(const rec of db.records){
      if(rec.telegramId!==groupId||(threadId!=="all"&&String(rec.topicId??"")!==threadId))continue;
      const date=Date.parse(rec.date);
      if(Number.isFinite(date)&&date>max)max=date;
    }
    return max?new Date(max).toISOString():null;
  }
  function syncStamp(value){
    return value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("pt-BR"):"Ainda não realizada";
  }
  function renderSyncSettings(){
    const mount=$("tgSyncSettingsMount");if(!mount)return;
    const options=syncOptions(),db=readHistory();
    if(syncConfigTarget!=="all"&&!options.some(t=>t.key===syncConfigTarget))syncConfigTarget="all";
    const selected=options.find(t=>t.key===syncConfigTarget);
    const starts=[...new Set(options.map(t=>t.startAt||""))];
    const dateValue=syncConfigTarget==="all"?(starts.length===1?starts[0]:""):(selected?.startAt||"");
    const previous=syncConfigTarget==="all"?db.lastCompleteSync:
      db.lastSyncBySource?.[syncConfigTarget]?.lastCompletedAt;
    const previousAttempt=syncConfigTarget==="all"?db.lastSync:
      db.lastSyncBySource?.[syncConfigTarget]?.lastAttemptAt;
    const newest=selected?lastMessageFor(selected,db):options.reduce((max,o)=>{
      const time=Date.parse(lastMessageFor(o,db)||"");
      return Number.isFinite(time)&&time>max?time:max;
    },0);
    const newestStamp=typeof newest==="number"?(newest?new Date(newest).toISOString():null):newest;
    const sourceRows=options.map(o=>{
      const item=db.lastSyncBySource?.[o.key],oldStart=!!item?.lastCompletedStartAt&&item.lastCompletedStartAt!==o.startAt;
      const state=db.historyBackfills?.[o.key];
      const recovered=o.startAt&&state?.startAt===o.startAt&&state.done&&!db.recentPending?.[o.key];
      const badge=!o.startAt?"Sem data inicial":recovered?"Histórico recuperado":"Recuperação pendente";
      return '<div class="tg-sync-source"><strong>'+enc(o.name)+'</strong>'+
        '<small>'+badge+' · Início: '+(o.startAt?enc(syncStamp(o.startAt)):"não definido")+'</small>'+
        '<small>Última conclusão: '+(item?.lastCompletedAt?enc(syncStamp(item.lastCompletedAt))+(oldStart?" (data inicial anterior)":""):"não realizada")+'</small></div>';
    }).join("");
    const logs=(db.syncSessions||[]).slice(0,12).map(item=>
      '<div class="tg-sync-log"><strong>'+enc(syncStamp(item.at))+'</strong>'+
      '<small class="'+(item.complete?"tg-sync-done":"tg-sync-partial")+'">'+(item.complete?"Concluída":"Parcial / com pendências")+
      '</small><span>'+Number(item.added||0)+' novas · '+Number(item.checked||0)+' reações verificadas</span></div>').join("");
    mount.innerHTML='<section class="tg-sync-console" aria-labelledby="tgSyncConsoleTitle">'+
      '<div class="tg-sync-console-heading"><div><span class="tg-sync-eyebrow">SINCRONIZAÇÃO E HISTÓRICO</span>'+
        '<h4 id="tgSyncConsoleTitle">Sincronizar mensagens</h4>'+
        '<p>Configure a data aqui, junto da conexão. Os dados capturados anteriormente permanecem guardados.</p></div></div>'+
      (options.length?'<div class="tg-sync-controls">'+
        '<label>Grupo ou tópico<select id="tgSyncTarget"><option value="all"'+(syncConfigTarget==="all"?' selected':'')+'>Todos os grupos/tópicos monitorados</option>'+
        options.map(o=>'<option value="'+enc(o.key)+'"'+(syncConfigTarget===o.key?' selected':'')+'>'+enc(o.name)+'</option>').join("")+'</select></label>'+
        '<label>Sincronizar a partir de:<input id="tgSyncFrom" type="datetime-local" value="'+enc(localDateInput(dateValue))+'"></label>'+
        '<div class="tg-sync-buttons"><button type="button" class="btn btn-soft" id="tgSyncSaveStart">Salvar data inicial</button>'+
        '<button type="button" class="btn btn-primary" id="tgSyncRun"'+(!logged()||syncRunning?' disabled':'')+'>'+
        (syncRunning?"Sincronizando…":syncConfigTarget==="all"?"↻ Sincronizar todos":"↻ Sincronizar este tópico")+'</button></div></div>'+
        (syncConfigTarget==="all"&&starts.length>1?'<p class="tg-sync-hint">Os tópicos possuem datas diferentes. Escolha uma nova data para unificar ou sincronize mantendo as datas já salvas.</p>':
         '<p class="tg-sync-hint">A data define o início da recuperação. Você pode voltar a uma data anterior sem apagar o histórico.</p>'):
        '<div class="tg-sync-empty">Nenhum grupo monitorado. Em <strong>Monitoramento → Selecionar grupos e tópicos</strong>, escolha as conversas antes de sincronizar.</div>')+
      (!logged()?'<p class="tg-sync-hint">Conecte sua conta Telegram acima para habilitar a sincronização.</p>':'')+
      '<p class="tg-sync-feedback'+(syncNoticeError?' error':'')+'" id="tgSyncFeedback" role="status" aria-live="polite">'+
        enc(syncNotice||"Escolha a data inicial e toque em Sincronizar agora.")+'</p>'+
      '<div class="tg-sync-overview"><div><small>Última sincronização concluída</small><strong>'+enc(syncStamp(previous))+'</strong></div>'+
        '<div><small>Última tentativa</small><strong>'+enc(syncStamp(previousAttempt))+'</strong></div>'+
        '<div><small>Última mensagem registrada</small><strong>'+enc(syncStamp(newestStamp))+'</strong></div></div>'+
      '<details class="tg-sync-history"><summary>Histórico de sincronizações ('+(db.syncSessions?.length||0)+')</summary>'+
        '<div class="tg-sync-log-list">'+(logs||'<p>Nenhuma execução registrada neste navegador.</p>')+'</div>'+
        '<h5>Grupos e tópicos</h5><div class="tg-sync-sources">'+(sourceRows||'<p>Nenhum grupo configurado.</p>')+'</div>'+
        '</details></section>';
  }
  function matchesMonitorScope(record,group,topic){
    if(!group||record.telegramId!==group.id)return false;
    let startAt=group.startAt||"";
    if(group.isForum){
      const id=record.topicId==null?"":String(record.topicId);
      const chosen=group.topics.find(t=>t.id===id);
      if(!chosen)return false;
      if(topic!=="all"&&topic!==id)return false;
      startAt=chosen.startAt||group.startAt||"";
    }
    return !startAt||(Number.isFinite(Date.parse(record.date))&&Date.parse(record.date)>=Date.parse(startAt));
  }
  function readHistory(){
    try{
      const data=JSON.parse(localStorage.getItem(MONITOR_KEY)||"{}");
      return {cursors:data.cursors&&typeof data.cursors==="object"?data.cursors:{},records:Array.isArray(data.records)?data.records:[],backfills:data.backfills&&typeof data.backfills==="object"?data.backfills:{},historyBackfills:data.historyBackfills&&typeof data.historyBackfills==="object"?data.historyBackfills:{},dateAnchors:data.dateAnchors&&typeof data.dateAnchors==="object"?data.dateAnchors:{},recentPending:data.recentPending&&typeof data.recentPending==="object"?data.recentPending:{},lastSync:data.lastSync||null,lastCompleteSync:data.lastCompleteSync||null,lastSyncBySource:data.lastSyncBySource&&typeof data.lastSyncBySource==="object"?data.lastSyncBySource:{},syncSessions:Array.isArray(data.syncSessions)?data.syncSessions.slice(0,20):[]};
    }catch(_){return {cursors:{},records:[],backfills:{},historyBackfills:{},dateAnchors:{},recentPending:{},lastSync:null,lastCompleteSync:null,lastSyncBySource:{},syncSessions:[]};}
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
    // Identificar solicitações pelo comando de abertura, mesmo que o nome
    // de algum produto contenha "produto novo" ou "aumentou".
    if(/\bpor\s+favor\s*[,.:;]?\s*(?:cadastrar|atualizar|alterar|trocar|incluir|adicionar|verificar|ajustar|retirar|remover|colocar|desmembrar|corrigir|registrar|cancelar)\b/i.test(txt)
      ||/\b(?:solicita[cç][aã]o|solicito)\s+(?:de\s+)?(?:cadastro|atualiza[cç][aã]o|altera[cç][aã]o|corre[cç][aã]o|ajuste|desmembramento)\b/i.test(txt)
      ||/^\s*(?:CADASTRO|ATUALIZA[CÇ][AÃ]O\s+DE\s+CB|ALTERA[CÇ][AÃ]O\s+DE\s+NOMENCLATURA)\s*[:\-]/im.test(txt))return "solicitacao";
    // A seguir, avisos feitos por outros participantes do grupo.
    if(/\b(?:aumentou|abaixou|baixou|subiu|reduziu|reajustou)\b[^\n]{0,95}(?:R\$\s*)?\d+[.,]\d{2}/i.test(txt)
      ||/\b(?:aumento|redu[cç][aã]o|altera[cç][aã]o)\s+de\s+pre[cç]o\b/i.test(txt)
      ||/^\s*(?:AUMENTOU|ABAIXOU|DIMINUIU|REDUZIU)\b/im.test(txt))return "preco";
    if(/\b(?:produto|item|mercadoria)(?:s)?\s+novo(?:s)?\b|\bnovo(?:s)?\s+(?:produto|item|mercadoria)(?:s)?\b/i.test(txt))return "produto";
    return "recebida";
  }
  function insertMessage(state,g,m,kind,direction,index=null){
    const key=g.telegramId+":"+m.id;
    let rec=index?.get(key)||state.records.find(x=>x.key===key);
    const now=new Date().toISOString();
    if(!rec){
      const request=kind==="solicitacao",status=request?(m.reactionCount>0?"conferido":"pendente"):"informativo";
      rec={key,telegramId:g.telegramId,topicId:m.topicId??g.topicId??null,topicName:g.topicName||"",group:g.telegramName||g.name,
        messageId:m.id,date:m.date,text:String(m.text||""),kind,direction,senderId:String(m.senderId||""),
        reactionCount:request?(m.reactionCount||0):0,reactions:request?(m.reactions||[]):[],
        status,history:[{at:now,status,reason:"Primeira leitura"}]};
      state.records.push(rec);index?.set(key,rec);
    }else {
      rec.text=String(m.text??rec.text??"");
      rec.date=m.date||rec.date;
      rec.direction=direction;rec.kind=rec.manualKind||kind;rec.senderId=String(m.senderId||rec.senderId||"");
      if(rec.kind==="solicitacao"&&rec.status==="informativo"){
        rec.status="pendente";
        (rec.history ||= []).push({at:now,status:"pendente",reason:"Solicitação identificada"});
      }
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
  // A versão antiga carregava só 200 mensagens na primeira leitura e avançava
  // o cursor, deixando intervalos anteriores nunca visitados. Descobrimos o
  // ponto de corte pelo ID cronológico sem precisar reinstalar a biblioteca.
  async function findDateAnchor(groupId,startAt,db){
    db.dateAnchors ||= {};
    const key=groupId+"|"+startAt;
    const saved=db.dateAnchors[key];
    if(saved&&Number.isInteger(saved.cursor)&&saved.cursor>=0)return saved;
    const tg=window.TelegramBridge;
    const recent=await tg.scan(groupId,0,200,null);
    const latestId=Number(recent.lastId||0);
    if(!latestId){
      const empty={cursor:0,latestId:0,afterAll:true};
      db.dateAnchors[key]=empty;writeHistory(db);return empty;
    }
    const last=recent.messages[recent.messages.length-1];
    if(last && Date.parse(last.date)<Date.parse(startAt)){
      const afterAll={cursor:latestId,latestId,afterAll:true};
      db.dateAnchors[key]=afterAll;writeHistory(db);return afterAll;
    }
    // Se a data está dentro das 200 mensagens mais recentes,
    // podemos usar diretamente esse recorte, evitando muitas consultas.
    const firstRecent=recent.messages[0];
    if(firstRecent&&Date.parse(firstRecent.date)<=Date.parse(startAt)){
      const match=recent.messages.find(m=>Date.parse(m.date)>=Date.parse(startAt));
      if(match){
        const quick={cursor:Math.max(1,Number(match.id)-2),latestId,afterAll:false};
        db.dateAnchors[key]=quick;writeHistory(db);return quick;
      }
    }
    let lo=2,hi=latestId,probes=0;
    while(lo<hi&&probes<36){
      const mid=Math.floor((lo+hi)/2);
      const page=await tg.scan(groupId,mid-1,1,null);
      const first=page.messages[0];
      if(!first){hi=mid;probes++;continue;}
      const at=Date.parse(first.date);
      if(!Number.isFinite(at))throw new Error("Telegram retornou uma mensagem sem data válida na pesquisa.");
      if(at>=Date.parse(startAt))hi=mid;
      else lo=Math.max(mid+1,Number(first.id)+1);
      probes++;
    }
    if(lo<hi)throw new Error("Não foi possível localizar o início do histórico com segurança. Tente novamente.");
    const result={cursor:Math.max(1,lo-2),latestId,afterAll:false};
    db.dateAnchors[key]=result;
    writeHistory(db);
    return result;
  }
  async function synchronize(onProgress,targetKey="all"){
    if(syncRunning)throw new Error("Uma sincronização já está em andamento.");
    if(!logged())throw new Error("Conecte sua conta Telegram para sincronizar.");
    const candidates=selectedTargets();
    const targets=targetKey==="all"?candidates:candidates.filter(t=>
      t.telegramId+":topic:"+(t.topicId??"all")===targetKey);
    if(!targets.length)throw new Error("Escolha os grupos e tópicos em Monitoramento → Configurar monitoramento.");
    const missing=targets.filter(t=>!t.startAt||!Number.isFinite(Date.parse(t.startAt)));
    if(missing.length)throw new Error("Defina 'Sincronizar a partir de' para: "+missing.map(t=>t.name).slice(0,5).join(", ")+(missing.length>5?" e outros":"")+".");
    syncRunning=true;
    const notify=message=>{if(typeof onProgress==="function")onProgress(message);};
    try{
      const db=readHistory(),errors=[],pending=[],meId=window.TelegramBridge.getMeId();
      db.historyBackfills ||= {};db.dateAnchors ||= {};db.recentPending ||= {};
      db.lastSyncBySource ||= {};db.syncSessions ||= [];
      const cache=new Map(db.records.map(r=>[r.key,r]));
      let added=0,checked=0,examined=0;
      const append=(group,msg)=>{
        if(!Number.isFinite(Date.parse(msg.date))||Date.parse(msg.date)<Date.parse(group.startAt))return;
        const key=group.telegramId+":"+msg.id;
        if(!cache.has(key))added++;
        insertMessage(db,group,msg,recognize(msg,meId),directionOf(msg,meId),cache);
      };
      for(let i=0;i<targets.length;i++){
        const group=targets[i],cursorKey=group.telegramId+":topic:"+(group.topicId??"all");
        const prefix="["+ (i+1)+"/"+targets.length+"] "+group.name+": ";
        try{
          let state=db.historyBackfills[cursorKey];
          if(!state||state.startAt!==group.startAt){
            notify(prefix+"localizando a data de início…");
            const anchor=await findDateAnchor(group.telegramId,group.startAt,db);
            state={startAt:group.startAt,cursor:anchor.cursor,done:anchor.afterAll,
              examined:0,matched:0,lastDate:""};
            db.historyBackfills[cursorKey]=state;
            writeHistory(db);
          }
          // Ler primeiro a parte histórica, de onde o usuário decidiu começar.
          // O progresso é persistido página a página para retomar sem saltos.
          let batch=0;
          while(!state.done&&batch<6){
            notify(prefix+"recuperando histórico desde "+new Date(group.startAt).toLocaleString("pt-BR")+
              " — "+state.examined+" examinadas…");
            const page=await window.TelegramBridge.scan(group.telegramId,state.cursor,400,group.topicId??null);
            if(page.lastId<=state.cursor){
              if(page.truncated)throw new Error("A paginação do Telegram não avançou; histórico interrompido com segurança.");
              state.done=true;writeHistory(db);break;
            }
            for(const msg of page.messages){append(group,msg);state.matched++;}
            // cursor considera a posição lida, inclusive mensagens de outros tópicos
            // descartadas na visualização Geral.
            state.cursor=page.lastId;state.examined+=page.examined??page.messages.length;
            examined+=page.examined??page.messages.length;
            if(page.messages.length){
              state.lastDate=page.messages[page.messages.length-1].date;
            }
            state.done=!page.truncated;
            writeHistory(db);batch++;
          }
          if(!state.done)pending.push(group.name+": histórico em andamento ("+state.matched+" mensagens recuperadas). Clique novamente em sincronizar.");
          // Ler novas mensagens desde o último ID salvo. Nunca remover registros
          // anteriores; se a leitura ultrapassar o limite desta rodada, avisar.
          let pages=0,more=true;
          while(more&&pages<7){
            const old=Number((db.cursors[cursorKey]??(group.topicId==null?db.cursors[group.telegramId]:0))||0);
            notify(prefix+"verificando mensagens recentes…");
            const page=await window.TelegramBridge.scan(group.telegramId,old,1200,group.topicId??null);
            for(const msg of page.messages)append(group,msg);
            let latest=Number(page.lastId||0);
            if(old===0&&group.topicId==="1"){
              const global=await window.TelegramBridge.scan(group.telegramId,0,200,null);
              latest=Math.max(latest,Number(global.lastId||0));
            }
            const next=Math.max(old,latest);
            if(next===old&&page.truncated)throw new Error("Leitura recente não avançou, será retomada sem descartar mensagens.");
            db.cursors[cursorKey]=next;
            writeHistory(db);
            more=page.truncated;pages++;
          }
          db.recentPending[cursorKey]=more;writeHistory(db);
          if(more)pending.push(group.name+": mensagens recentes incompletas; sincronize novamente.");
          // Conferência de solicitações de todos os autores.
          const records=db.records.filter(r=>r.telegramId===group.telegramId &&
            (group.topicId==null||String(r.topicId??"")===String(group.topicId))&&
            r.kind==="solicitacao"&&Date.parse(r.date)>=Date.parse(group.startAt));
          for(let offset=0;offset<records.length;offset+=50){
            const chunk=records.slice(offset,offset+50);
            notify(prefix+"conferindo reações ("+Math.min(offset+chunk.length,records.length)+"/"+records.length+")…");
            const reactions=await window.TelegramBridge.reactions(group.telegramId,chunk.map(r=>r.messageId));
            const byId=new Map(reactions.map(r=>[r.id,r]));
            for(const rec of chunk){
              const data=byId.get(rec.messageId);
              if(data){applyReaction(rec,data);checked++;}
            }
            writeHistory(db);
          }
          const now=new Date().toISOString(),prev=db.lastSyncBySource[cursorKey]||{};
          const sourceComplete=state.done&&!more;
          db.lastSyncBySource[cursorKey]={
            lastAttemptAt:now,
            lastCompletedAt:sourceComplete?now:(prev.lastCompletedAt||null),
            lastCompletedStartAt:sourceComplete?group.startAt:(prev.lastCompletedStartAt||null),
            lastResult:sourceComplete?"concluida":"parcial",startAt:group.startAt,
            lastMessageAt:db.records.reduce((value,rec)=>{
              if(rec.telegramId!==group.telegramId||
                (group.topicId!=null&&String(rec.topicId??"")!==String(group.topicId)))return value;
              const at=Date.parse(rec.date);
              return Number.isFinite(at)&&at>value?at:value;
            },0)||null
          };
          writeHistory(db);
        }catch(err){
          errors.push(group.name+": "+String(err.message||err));
          const prev=db.lastSyncBySource[cursorKey]||{};
          db.lastSyncBySource[cursorKey]={...prev,lastAttemptAt:new Date().toISOString(),
            lastResult:"erro",startAt:group.startAt};
          try{writeHistory(db);}catch(_){}
        }
      }
      const at=new Date().toISOString(),complete=!errors.length&&!pending.length;
      db.lastSync=at;
      if(complete)db.lastCompleteSync=at;
      db.syncSessions=[{at,complete,scope:targetKey,sourceCount:targets.length,added,checked,
        pending:pending.length,errors:errors.length},...(db.syncSessions||[])].slice(0,20);
      writeHistory(db);
      return {added,checked,examined,total:db.records.length,errors,pending,complete};
    }finally{syncRunning=false;}
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
  function priceDetails(rec,entries){
    if(!entries?.length)return '<pre>'+enc(rec.text||"")+'</pre>';
    return '<div class="tg-price-entries">'+entries.map(entry=>{
      const tone=entry.state==="up"?"up":entry.state==="down"?"down":"neutral";
      const label=tone==="up"?"↑ AUMENTOU":tone==="down"?"↓ BAIXOU":"PREÇO INFORMADO";
      const before=entry.before!==null?'<div class="tg-price-value tg-price-before"><small>'+
          (entry.origin==="previous"?"Antes · último aviso":"Antes")+'</small><strong>'+enc(window.TelegramPriceView.show(entry.before))+'</strong></div>':
          '<div class="tg-price-value tg-price-unavailable"><small>Antes</small><span>Não informado</span></div>';
      const current=entry.after!==null?'<div class="tg-price-value tg-price-current"><small>Atual · informado</small><strong>'+enc(window.TelegramPriceView.show(entry.after))+'</strong></div>':
          '<div class="tg-price-value tg-price-unavailable"><small>Atual</small><span>Não informado</span></div>';
      return '<div class="tg-price-entry tg-price-'+tone+'">'+
        '<div class="tg-price-item-heading"><div><strong>CI '+enc(entry.ci)+'</strong>'+
        (entry.name?'<span>'+enc(entry.name)+'</span>':'')+'</div>'+
        '<span class="tg-price-change">'+label+'</span></div>'+
        '<div class="tg-price-values">'+before+'<span class="tg-price-arrow" aria-hidden="true">→</span>'+current+'</div>'+
        (entry.cb?'<div class="tg-price-barcode">CB: '+enc(entry.cb)+'</div>':'')+
        (entry.mismatch?'<p class="tg-price-alert">Atenção: o sentido do aviso diverge dos valores informados. Confira os dados.</p>':'')+
        '</div>';
    }).join("")+'</div>'+
    '<details class="tg-price-source"><summary>Ver mensagem original</summary><pre>'+enc(rec.text||"")+'</pre></details>';
  }
  function monitorHtml(){
    const {selection,group}=monitorScope(),db=readHistory();
    if(!selection.groups.length)monitorSettingsOpen=true;
    if(group&&activeMonitorTopic!=="all"&&!group.topics.some(t=>t.id===activeMonitorTopic))activeMonitorTopic="all";
    const all=group?db.records.filter(r=>matchesMonitorScope(r,group,activeMonitorTopic))
      .sort((a,b)=>new Date(b.date)-new Date(a.date)):[];
    const priceIndex=window.TelegramPriceView?.buildIndex?.(db.records)||new Map();
    const sent=all.filter(r=>recordDirection(r)==="enviadas");
    const incoming=all.filter(r=>recordDirection(r)==="recebidas");
    const grouped={solicitacao:incoming.filter(r=>r.kind==="solicitacao"),preco:incoming.filter(r=>r.kind==="preco"),
      produto:incoming.filter(r=>r.kind==="produto"),outras:incoming.filter(r=>!["solicitacao","preco","produto"].includes(r.kind))};
    const visible=activeMonitorDirection==="recebidas"?
      incoming.filter(r=>activeReceivedCategory==="todas"||r.kind===activeReceivedCategory||
        (activeReceivedCategory==="outras"&&!["solicitacao","preco","produto"].includes(r.kind))):sent;
    const allRequests=all.filter(r=>r.kind==="solicitacao");
    const verified=allRequests.filter(r=>r.status==="conferido"&&!r.unavailable).length;
    const pending=allRequests.filter(r=>r.status==="pendente"&&!r.unavailable).length;
    const totalSources=selection.groups.reduce((count,g)=>count+(g.isForum?g.topics.length:1),0);
    const configuredTargets=selectedTargets();
    const needsStart=configuredTargets.filter(t=>!t.startAt).length;
    const incomplete=configuredTargets.filter(t=>{
      if(!t.startAt)return false;
      const key=t.telegramId+":topic:"+(t.topicId??"all");
      const state=db.historyBackfills?.[key];
      return !state||state.startAt!==t.startAt||!state.done||!!db.recentPending?.[key];
    }).length;
    const metric=(title,value,tone,note)=>'<div class="tg-stat" data-tone="'+tone+'"><div class="tg-stat-label">'+title+'</div><strong class="tg-stat-value">'+value+'</strong><div class="tg-stat-note">'+note+'</div></div>';
    const tabs='<nav class="tg-monitor-tabs" aria-label="Grupos monitorados">'+selection.groups.map(g=>{
      const selected=g.id===activeMonitorGroup;
      return '<button type="button" class="tg-monitor-tab'+(selected?' active':'')+'" data-mon-tab="'+enc(g.id)+'" aria-current="'+(selected?'page':'false')+'">'+enc(g.name)+'</button>';
    }).join("")+'</nav>';
    const topics=group?.isForum?'<nav class="tg-monitor-topics" aria-label="Tópicos do grupo selecionado">'+
      '<button type="button" class="tg-monitor-topic'+(activeMonitorTopic==="all"?' active':'')+'" data-mon-filter="all">Todos os tópicos escolhidos</button>'+
      group.topics.map(t=>'<button type="button" class="tg-monitor-topic'+(activeMonitorTopic===t.id?' active':'')+'" data-mon-filter="'+enc(t.id)+'">'+enc(t.name)+'</button>').join("")+'</nav>':"";
    const top='<div class="tg-monitor-controls"><div><strong>Monitoramento por grupo</strong><p>Consulte mensagens de todos os participantes, separadas por quem enviou e pelo assunto.</p></div>'+
      '<button type="button" id="tgMonToggleConfig" class="btn btn-soft btn-small" aria-expanded="'+monitorSettingsOpen+'">⚙ Selecionar grupos e tópicos</button></div>';
    const directionTabs='<nav class="tg-monitor-directions" aria-label="Origem das mensagens">'+
      '<button type="button" class="tg-monitor-direction'+(activeMonitorDirection==="enviadas"?' active':'')+'" data-mon-direction="enviadas" aria-pressed="'+(activeMonitorDirection==="enviadas")+'"><span>Minhas mensagens</span><strong>'+sent.length+'</strong></button>'+
      '<button type="button" class="tg-monitor-direction'+(activeMonitorDirection==="recebidas"?' active':'')+'" data-mon-direction="recebidas" aria-pressed="'+(activeMonitorDirection==="recebidas")+'"><span>Mensagens recebidas</span><strong>'+incoming.length+'</strong></button></nav>';
    const receivedFilters='<nav class="tg-monitor-categories" aria-label="Tipos de mensagens recebidas">'+[
      ["todas","Todas",incoming.length],["solicitacao","Solicitações dos colegas",grouped.solicitacao.length],
      ["preco","Alterações de preço",grouped.preco.length],["produto","Produtos novos",grouped.produto.length],
      ["outras","Outras",grouped.outras.length]
    ].map(([key,label,count])=>'<button type="button" class="tg-monitor-category'+(activeReceivedCategory===key?' active':'')+'" data-mon-category="'+key+'" aria-pressed="'+(activeReceivedCategory===key)+'">'+label+' <span>'+count+'</span></button>').join("")+'</nav>';
    const start=group?'<section class="tg-sync-start" aria-label="Data inicial da sincronização">'+
      '<div class="tg-sync-start-text"><strong>Sincronizar a partir de</strong><small>'+
        (group.isForum&&activeMonitorTopic==="all"?'Data para todos os tópicos deste grupo':
         group.isForum?'Data para o tópico escolhido':'Data para este grupo')+
        ' · horário local</small></div>'+
      '<input type="datetime-local" id="tgMonStartDate" aria-label="Data e hora do início da sincronização" value="'+
        enc(localDateInput(startDateFor(group,activeMonitorTopic)))+'">'+
      '<button type="button" class="btn btn-ghost btn-small" id="tgMonApplyStartAll" title="Usar a mesma data em todos os grupos e tópicos monitorados">Aplicar a todos</button>'+
      '<p id="tgMonStartHint" class="tg-sync-start-hint">A data é salva ao alterar o campo. Mensagens anteriores permanecem guardadas, mas não aparecem neste recorte. Para recuperar mais histórico, sincronize novamente enquanto houver pendências.</p></section>':"";
    const stats='<section class="tg-stats" aria-label="Indicadores das mensagens">'+
      (activeMonitorDirection==="enviadas"?
        metric("Minhas mensagens",sent.length,"info","Deste grupo ou tópico")+
        metric("Conferidas",sent.filter(r=>r.kind==="solicitacao"&&r.status==="conferido").length,"success","Com reação")+
        metric("Pendentes",sent.filter(r=>r.kind==="solicitacao"&&r.status==="pendente").length,"warning","Sem reação")+
        metric("Fontes selecionadas",totalSources,"info","Grupos / tópicos monitorados"):
        metric("Recebidas",incoming.length,"info","Mensagens dos demais participantes")+
        metric("Solicitações",grouped.solicitacao.length,"warning","Também acompanhadas por reações")+
        metric("Preços",grouped.preco.length,"info","Atualizações identificadas")+
        metric("Produtos novos",grouped.produto.length,"success","Comunicados identificados"))+
      '</section>';
    const readiness='<div class="tg-monitor-readiness '+(needsStart||incomplete?'incomplete':'ready')+'">'+
      (needsStart?'⚠ '+needsStart+' grupo(s)/tópico(s) sem data de início. Configure antes de sincronizar.':
       incomplete?'◷ Histórico em recuperação: '+incomplete+' fonte(s) ainda incompletas. Continue sincronizando para recuperar tudo que estiver disponível.':
       configuredTargets.length?'✓ Histórico percorrido até o limite disponível nas fontes escolhidas.':'Selecione grupos para iniciar o monitoramento.')+
      '</div>';
    const sync='<div class="tg-monitor-head"><div><strong>'+visible.length+' mensagem(ns) exibida(s)</strong>'+
      '<small>Última sincronização: '+(db.lastSync?enc(new Date(db.lastSync).toLocaleString("pt-BR")):"nunca")+
      ' · Solicitações conferidas neste grupo: '+verified+' · pendentes: '+pending+'</small></div>'+
      '<button type="button" class="btn btn-primary btn-small" id="tgSyncNow"'+(!selection.groups.length?' disabled':'')+'>↻ Sincronizar selecionados</button></div>';
    const status='<p class="tg-auth-message" id="tgMonitorStatus" role="status" aria-live="polite">'+
      (!logged()?"Conecte sua conta em Telegram → Configurações.":!selection.groups.length?"Configure quais grupos e tópicos acompanhar.":"A sincronização consulta todas as mensagens das fontes escolhidas e revalida as reações das solicitações de qualquer participante.")+'</p>';
    const content=visible.length?'<div class="tg-records">'+visible.map(rec=>{
      const received=recordDirection(rec)==="recebidas",request=rec.kind==="solicitacao";
      const parsed=request?extract(rec.text):[];
      const prices=received&&rec.kind==="preco"?(priceIndex.get(String(rec.telegramId||"")+":"+String(rec.messageId))||[]):[];
      const fallbackState=window.TelegramPriceView?.movement?.(rec.text||"")||"";
      const priceState=prices.length&&prices.every(p=>p.state==="up")?"up":
        prices.length&&prices.every(p=>p.state==="down")?"down":
        prices.length?"neutral":(fallbackState||"neutral");
      const priceLabel=priceState==="up"?"↑ AUMENTOU":priceState==="down"?"↓ BAIXOU":"Alteração de preço";
      const label=request?(rec.unavailable?"Mensagem indisponível":rec.status==="conferido"?"Conferido":"Não conferido"):
        rec.kind==="preco"?priceLabel:rec.kind==="produto"?"Produto novo":"Mensagem recebida";
      const block=received&&rec.kind==="preco"?priceDetails(rec,prices):
        parsed.length?parsed.map(p=>'<div class="tg-monitor-item"><strong>'+enc(p.ci)+' - '+enc(p.name)+'</strong>'+(p.cb?'<small>CB: '+enc(p.cb)+'</small>':'')+'</div>').join(""):'<pre>'+enc(rec.text)+'</pre>';
      const sender=received?'Recebida de participante'+(rec.senderId?' (ID '+enc(rec.senderId)+')':''):'Enviada por mim';
      const requestAction=received?'<div class="tg-record-actions"><button type="button" class="btn btn-ghost btn-small" data-mon-request="'+enc(rec.key)+'">'+
        (request?'Não é solicitação':'Marcar como solicitação')+'</button></div>':"";
      return '<article class="tg-record'+(received&&rec.kind==="preco"?' tg-record-price tg-price-'+priceState:'')+'"><div class="tg-record-top"><strong>'+enc(rec.group)+(rec.topicName?' · '+enc(rec.topicName):'')+
        '</strong><span class="tg-rec-state '+(request&&rec.status==="conferido"&&!rec.unavailable?"ok":"")+(received&&rec.kind==="preco"?" tg-price-state-"+priceState:"")+'">'+enc(label)+'</span></div>'+
        '<small>'+sender+' · '+enc(new Date(rec.date).toLocaleString("pt-BR"))+' · Mensagem #'+enc(rec.messageId)+'</small>'+
        '<div class="tg-record-content">'+block+'</div>'+
        '<small>'+(request?(rec.reactionCount||0)+' reação(ões) · '+(rec.history?.length||0)+' evento(s) registrados':
           'Mensagem informativa, sem status de conferência')+'</small>'+requestAction+'</article>';
    }).join("")+'</div>':'<div class="tg-information"><strong>Nenhuma mensagem nesta visualização.</strong><p>'+
      (!group?"Configure um grupo para começar.":"Não há mensagens nesta categoria no histórico local. Use Sincronizar selecionados para consultar novas mensagens.")+'</p></div>';
    const txtReport=monitorReportOpen?
      '<div id="tgReportContainer" class="tg-report-container">'+
        (window.TelegramReports?.panelHtml?.({group,activeTopic:activeMonitorTopic})||
          '<p class="tg-muted">Não foi possível carregar o gerador de relatórios. Atualize a página.</p>')+
      '</div>':'';
    return top+txtReport+(monitorSettingsOpen?monitorConfigHtml(selection):"")+tabs+topics+start+readiness+directionTabs+
      (activeMonitorDirection==="recebidas"?receivedFilters:"")+stats+sync+status+content;
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
    const launcher=$("tgReportOpen");
    if(launcher){
      launcher.setAttribute("aria-expanded",String(monitorReportOpen));
      launcher.textContent=monitorReportOpen?"▤ Ocultar relatório TXT":"▤ Relatório TXT";
    }
    if(monitorSettingsOpen&&draftMonitorGroup){
      const picker=$("tgMonGroupPick");
      if(picker)picker.value=draftMonitorGroup;
      renderMonitorTopicChoices();
    }
  }
  document.addEventListener("change",e=>{
    const el=e.target;
    if(el.id==="tgMonStartDate"){
      const hint=$("tgMonStartHint");
      try{
        const iso=saveStartDate(el.value);
        renderMonitor();
        const refreshed=$("tgMonStartHint")||hint;
        if(refreshed){refreshed.textContent="Início salvo: "+new Date(iso).toLocaleString("pt-BR")+". Agora clique em Sincronizar selecionados.";refreshed.classList.remove("error");}
      }catch(err){
        if(hint){hint.textContent=String(err.message||err);hint.classList.add("error");}
      }
      return;
    }
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
    if(e.target.closest("#tgMonApplyStartAll")){
      const input=$("tgMonStartDate"),hint=$("tgMonStartHint");
      try{
        const iso=saveStartDate(input?.value||"","all");
        renderMonitor();
        const refreshed=$("tgMonStartHint")||hint;
        if(refreshed){refreshed.textContent="A mesma data foi salva para todos os grupos e tópicos: "+new Date(iso).toLocaleString("pt-BR")+".";refreshed.classList.remove("error");}
      }catch(err){if(hint){hint.textContent=String(err.message||err);hint.classList.add("error");}}
      return;
    }
    if(e.target.closest("#tgReportOpen")){
      monitorReportOpen=!monitorReportOpen;
      renderMonitor();
      if(monitorReportOpen)$("tgReportContainer")?.scrollIntoView?.({behavior:"smooth",block:"start"});
      return;
    }
    if(e.target.closest("#tgMonToggleConfig")){
      monitorSettingsOpen=!monitorSettingsOpen;draftMonitorGroup="";draftMonitorTopics=[];renderMonitor();return;
    }
    const direction=e.target.closest("[data-mon-direction]");
    if(direction){
      activeMonitorDirection=direction.dataset.monDirection;
      activeReceivedCategory="todas";
      renderMonitor();return;
    }
    const category=e.target.closest("[data-mon-category]");
    if(category){activeReceivedCategory=category.dataset.monCategory;renderMonitor();return;}
    const requestToggle=e.target.closest("[data-mon-request]");
    if(requestToggle){
      const state=readHistory(),rec=state.records.find(r=>r.key===requestToggle.dataset.monRequest);
      if(!rec||recordDirection(rec)!=="recebidas")return;
      const next=rec.kind==="solicitacao"?"recebida":"solicitacao";
      rec.manualKind=next;rec.kind=next;
      const nextStatus=next==="solicitacao"?"pendente":"informativo";
      if(rec.status!==nextStatus){
        rec.status=nextStatus;
        (rec.history ||= []).push({at:new Date().toISOString(),status:nextStatus,reason:"Classificação manual no monitor"});
      }
      if(next!=="solicitacao"){rec.reactionCount=0;rec.reactions=[];}
      try{writeHistory(state);renderMonitor();}
      catch(e){alert(String(e.message||e));}
      return;
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
      const config=readMonitorSelection(),index=config.groups.findIndex(x=>x.id===id);
      const previous=index<0?null:config.groups[index];
      const entry={id:g.id,name:g.name,isForum:!!g.isForum,startAt:previous?.startAt||"",
        topics:topicsChosen.map(t=>{
          const earlier=previous?.topics.find(p=>p.id===String(t.id));
          return {id:String(t.id),name:String(t.name),startAt:earlier?.startAt||previous?.startAt||""};
        })};
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
      const status=$("tgMonitorStatus");
      if(status)status.textContent="Iniciando recuperação do histórico…";
      try{
        const result=await synchronize(message=>{
          const el=$("tgMonitorStatus");if(el)el.textContent=message;
        });
        renderMonitor();
        const el=$("tgMonitorStatus");
        if(el)el.textContent=(result.complete?"Sincronização concluída. ":"Sincronização parcial — há mensagens pendentes. ")+
          result.added+" novas registradas, "+result.checked+" conferências verificadas. "+
          [...result.pending,...result.errors].join(" | ");
      }catch(err){const el=$("tgMonitorStatus")||status;if(el)el.textContent=String(err.message||err);}
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
    renderLogin,renderMonitor,synchronize,readHistory,
    getReportScope:()=>{const {group}=monitorScope();return {group,activeTopic:activeMonitorTopic};}
  };
})();
