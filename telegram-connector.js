/* Telegram no navegador: autenticação MTProto sob demanda.
   Segredos e sessão são cifrados localmente com AES-GCM/PBKDF2.
   Este script não possui credenciais embutidas. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const KEY="controle-pdc-telegram-sessao-cifrada-v1";
  const MONITOR_KEY="controle-pdc-telegram-historico-local-v1";
  const encoder=new TextEncoder(), decoder=new TextDecoder();
  const enc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let current=null, myGroups=[], busy=false;
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
    window.dispatchEvent(new CustomEvent("tg-connection-changed",{detail:{connected:false}}));
    setNote(forget?"Sessão local esquecida.":"Conexão encerrada neste navegador.");
  }
  async function reloadGroups(){
    if(!logged())return setNote("Conecte a conta primeiro.",true);
    try{setNote("Consultando grupos…");myGroups=await window.TelegramBridge.groups();setNote(myGroups.length+" grupos/canais encontrados.");window.dispatchEvent(new Event("tg-groups-updated"));}
    catch(e){setNote(String(e.message||e),true);}
  }
  function linked(){
    const entries=window.TelegramRouting?.groups?.()||[];
    const targets=entries.filter(g=>{
      if(!g.telegramId)return false;
      const actual=myGroups.find(x=>x.id===g.telegramId);
      return actual && (!actual.isForum || (g.topicId!=null && String(g.topicId)!==""));
    });
    return targets.filter((g,i)=>targets.findIndex(x=>x.telegramId===g.telegramId&&String(x.topicId??"")===String(g.topicId??""))===i);
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
  function recognize(m,ownId){
    if(m.out||m.senderId===ownId)return "solicitacao";
    const txt=String(m.text||"");
    if(/\b(?:aumentou|abaixou|baixou|subiu)\s*(?:para)?\s*(?:R\$\s*)?\d+[.,]\d{2}/i.test(txt))return "preco";
    if(/\bproduto(?:s)?\s+novo(?:s)?\b/i.test(txt))return "produto";
    return "";
  }
  function insertMessage(state,g,m,kind){
    const key=g.telegramId+":"+m.id;
    let rec=state.records.find(x=>x.key===key);
    const now=new Date().toISOString();
    if(!rec){
      rec={key,telegramId:g.telegramId,topicId:m.topicId??g.topicId??null,topicName:g.topicName||"",group:g.telegramName||g.name,messageId:m.id,date:m.date,text:m.text,kind,reactionCount:kind==="solicitacao"?(m.reactionCount||0):0,reactions:kind==="solicitacao"?(m.reactions||[]):[],status:kind==="solicitacao"?(m.reactionCount>0?"conferido":"pendente"):"informativo",history:[{at:now,status:kind==="solicitacao"?(m.reactionCount>0?"conferido":"pendente"):"informativo",reason:"Primeira leitura"}]};
      state.records.push(rec);
    }else {
      rec.text=m.text||rec.text;rec.date=m.date||rec.date;
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
    const targets=linked();
    if(!targets.length)throw new Error("Vincule ao menos um grupo ou tópico do Telegram aos destinos configurados.");
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
            const kind=recognize(msg,meId);
            if(kind){
              const key=group.telegramId+":"+msg.id;
              if(!db.records.some(r=>r.key===key))added++;
              insertMessage(db,group,msg,kind);
            }
          }
          db.cursors[cursorKey]=Math.max(cursor,page.lastId);
          writeHistory(db);
          more=page.truncated;pages++;
        }
        if(more)errors.push(group.name+": há mais mensagens para recuperar. Sincronize novamente.");
        const records=db.records.filter(r=>r.telegramId===group.telegramId &&
          (group.topicId==null || r.topicId==null || String(r.topicId)===String(group.topicId)) &&
          (!r.kind||r.kind==="solicitacao"));
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
  function monitorHtml(){
    const db=readHistory(),items=db.records.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
    const requests=items.filter(r=>r.kind==="solicitacao"||!r.kind);
    const verified=requests.filter(r=>r.status==="conferido"&&!r.unavailable).length;
    const pending=requests.filter(r=>r.status==="pendente"&&!r.unavailable).length;
    const sources=(window.TelegramRouting?.groups?.()||[]).filter(g=>g.telegramId&&(!g.isForum||g.topicId!=null)).length;
    const metric=(title,value,tone,note)=>'<div class="tg-stat" data-tone="'+tone+'"><div class="tg-stat-label">'+title+'</div><strong class="tg-stat-value">'+value+'</strong><div class="tg-stat-note">'+note+'</div></div>';
    const stats='<section class="tg-stats" aria-label="Resumo do monitoramento">'+
      metric("Mensagens registradas",items.length,"info","Histórico disponível")+
      metric("Conferidas",verified,"success","Com reação atualmente")+
      metric("Não conferidas",pending,"warning","Sem reação no último exame")+
      metric("Destinos vinculados",sources,"info","Grupos / tópicos configurados")+'</section>';
    return stats+'<div class="tg-monitor-head"><div><strong>'+items.length+' mensagem(ns) registrada(s)</strong><small>Última sincronização: '+(db.lastSync?enc(new Date(db.lastSync).toLocaleString("pt-BR")):"nunca")+'</small></div><button type="button" class="btn btn-primary btn-small" id="tgSyncNow">↻ Sincronizar agora</button></div>'+
      '<p class="tg-auth-message" id="tgMonitorStatus" role="status" aria-live="polite">'+(logged()?"Verifique novas mensagens e reações antigas.":"Conecte sua conta em Configurações.")+'</p>'+
      (items.length?'<div class="tg-records">'+items.map(rec=>{
        const parsed=extract(rec.text),status=rec.unavailable?"Mensagem indisponível":rec.kind==="preco"?"Atualização de preço":rec.kind==="produto"?"Produto novo":rec.status==="conferido"?"Conferido":"Não conferido";
        const rows=parsed.length?parsed.map(p=>'<div class="tg-monitor-item"><strong>'+enc(p.ci)+' - '+enc(p.name)+'</strong>'+(p.cb?'<small>CB: '+enc(p.cb)+'</small>':'')+'</div>').join(""):'<pre>'+enc(rec.text)+'</pre>';
        return '<article class="tg-record"><div class="tg-record-top"><strong>'+enc(rec.group)+(rec.topicName?' · '+enc(rec.topicName):'')+'</strong><span class="tg-rec-state '+(rec.status==="conferido"&&!rec.unavailable?"ok":"")+'">'+enc(status)+'</span></div><small>'+enc(new Date(rec.date).toLocaleString("pt-BR"))+' · Mensagem #'+rec.messageId+'</small><div class="tg-record-content">'+rows+'</div><small>'+(rec.reactionCount||0)+' reação(ões) · '+(rec.history?.length||0)+' evento(s) no histórico</small></article>';
      }).join("")+'</div>':'<div class="tg-information"><strong>Nenhuma solicitação registrada.</strong><p>Conecte a conta, vincule os grupos reais e inicie a primeira sincronização. Ela examinará inicialmente as últimas 200 mensagens de cada grupo; depois recuperará as novas por identificador.</p></div>');
  }
  function renderMonitor(){
    const mount=$("tgMonitorMount");if(mount)mount.innerHTML=monitorHtml();
  }
  document.addEventListener("click",async e=>{
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
  window.TelegramConnector={
    connected:logged,
    groups,
    topics,
    reloadGroups,
    send:async(groupId,text,topicId=null)=>{if(!logged())throw new Error("Conecte sua conta.");return window.TelegramBridge.send(groupId,text,topicId);},
    renderLogin,renderMonitor,synchronize,readHistory
  };
})();
