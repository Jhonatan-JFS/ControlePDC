import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, getDocsFromServer, getDocFromServer, runTransaction } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

// A chave de API Web identifica o projeto; acesso aos registros é controlado
// exclusivamente por Firebase Authentication e pelas Firestore Security Rules.
const firebaseConfig = {
  apiKey: "AIzaSyD-PVRK43L9kUAYXIPhsdL6KSz8DIJ5S9Y",
  authDomain: "controlepdc-41408.firebaseapp.com",
  projectId: "controlepdc-41408",
  storageBucket: "controlepdc-41408.firebasestorage.app",
  messagingSenderId: "688367436553",
  appId: "1:688367436553:web:3ce7393d508b10010f09d8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const ui = window.ControlPDC;
const TYPES = ["items", "events", "batches", "requests", "requestEvents"];
let activeUser = null;
let stopListeners = [];
let snapshots = {};
let pendingWrites = 0;
let latestRemote = {items: [], events: [], batches: [], requests: [], requestEvents: []};
let writeQueue = Promise.resolve();
let initialHintShown = false;
let blockedByError = false;
let recoveryChecked = false;
const recoveryButton = document.getElementById("retryPendingButton");
const recoveryKey = uid => "controle-pdc-v1-pending-" + uid;
function canonical(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}

function status(message, ready) {
  ui.setCloudReady(ready && !blockedByError && pendingWrites === 0, message, activeUser?.uid || "");
  document.getElementById("logoutButton").disabled = pendingWrites > 0;
}
function stopWatching() {
  stopListeners.forEach(fn => fn());
  stopListeners = [];
  snapshots = {};
}
function remoteData() {
  return {
    items: (snapshots.items || []).map(x => ({...x})),
    events: (snapshots.events || []).map(x => ({...x})),
    batches: (snapshots.batches || []).map(x => ({...x})),
    requests: (snapshots.requests || []).map(x => ({...x})),
    requestEvents: (snapshots.requestEvents || []).map(x => ({...x}))
  };
}
function allCollectionsLoaded() {
  return TYPES.every(type => snapshots[type] !== undefined);
}
function applyIfIdle() {
  if (!allCollectionsLoaded() || !activeUser || pendingWrites || blockedByError) return;
  latestRemote = remoteData();
  if (!recoveryChecked) {
    recoveryChecked = true;
    try {
      const raw = localStorage.getItem(recoveryKey(activeUser.uid));
      if (raw) {
        const copy = JSON.parse(raw);
        if (copy?.before && copy?.after) {
          blockedByError = true;
          ui.receiveCloud(copy.after);
          recoveryButton.hidden = false;
          status("Há alterações ainda não confirmadas. Tente sincronizar ou baixe um Backup JSON.", false);
          ui.notify("Encontramos uma cópia pendente neste navegador. Seus dados não foram descartados.", true);
          return;
        }
      }
    } catch (err) { blockedByError = true; status("Cópia de recuperação inválida. Consulte o backup.", false); return; }
  }
  ui.receiveCloud(latestRemote);
  status("Sincronizado com Firebase", true);
  if (!initialHintShown && !latestRemote.items.length) {
    initialHintShown = true;
    ui.notify("Banco conectado! Se você tem um backup anterior, use Restaurar para importar seus registros.");
  }
}

function recordChanges(before, after) {
  const operations = [];
  for (const type of TYPES) {
    const older = new Map((before[type] || []).filter(x => x.id).map(x => [String(x.id), x]));
    const newer = new Map((after[type] || []).filter(x => x.id).map(x => [String(x.id), x]));
    for (const [id, row] of newer) {
      if (!older.has(id) || JSON.stringify(older.get(id)) !== JSON.stringify(row))
        operations.push({type, id, data: row, previous: older.get(id) || null});
    }
    for (const id of older.keys()) if (!newer.has(id)) operations.push({type, id, remove: true, previous: older.get(id)});
  }
  return operations;
}

async function pushChanges(userId, operations) {
  // Transações comparam o registro lido com a versão editada. Se outro
  // aparelho alterou o mesmo documento, recusamos sobrescrever silenciosamente.
  for (let pos = 0; pos < operations.length; pos += 120) {
    const current = operations.slice(pos, pos + 120);
    await runTransaction(firestore, async tx => {
      const refs = current.map(op => doc(firestore, "users", userId, op.type, op.id));
      const remoteDocs = await Promise.all(refs.map(ref => tx.get(ref)));
      remoteDocs.forEach((snap, i) => {
        const remote = snap.exists() ? snap.data() : null;
        if (canonical(remote) === canonical(current[i].data || null) && !current[i].remove) return;
        if (current[i].remove && remote === null) return;
        if (canonical(remote) !== canonical(current[i].previous)) {
          throw Object.assign(new Error("Registro alterado por outro dispositivo"), {code: "controlepdc/conflito"});
        }
      });
      current.forEach((op, i) => {
        const remote = remoteDocs[i].exists() ? remoteDocs[i].data() : null;
        if (op.remove) { if (remote !== null) tx.delete(refs[i]); }
        else if (canonical(remote) !== canonical(op.data)) tx.set(refs[i], op.data);
      });
    });
  }
}

async function refreshFromServer(userId) {
  const entries = await Promise.all(TYPES.map(async type => {
    const snap = await getDocsFromServer(collection(firestore, "users", userId, type));
    return [type, snap.docs.map(record => ({...record.data(), id: record.id}))];
  }));
  if (activeUser?.uid !== userId) return;
  for (const [type, records] of entries) snapshots[type] = records;
  latestRemote = remoteData();
}

ui.onLocalChange((before, after) => {
  if (activeUser) {
    try { localStorage.setItem(recoveryKey(activeUser.uid), JSON.stringify({at: new Date().toISOString(), before, after})); }
    catch (_) { ui.notify("Não foi possível criar uma cópia local. Exporte um Backup JSON.", true); }
  }
  if (!activeUser || blockedByError || !navigator.onLine) {
    blockedByError = true;
    recoveryButton.hidden = false;
    status("Alteração não confirmada. Exporte Backup JSON ou tente recuperar.", false);
    ui.notify("Sem conexão: preservamos sua alteração local para recuperação.", true);
    return;
  }
  const operations = recordChanges(before, after);
  if (!operations.length) { try { localStorage.removeItem(recoveryKey(activeUser.uid)); } catch (_) {} applyIfIdle(); return; }
  const userId = activeUser.uid;
  pendingWrites++;
  status("Salvando " + operations.length + " registro(s)…", false);
  const operationPromise = writeQueue.then(async () => { await pushChanges(userId, operations); await refreshFromServer(userId); });
  writeQueue = operationPromise.catch(() => {});
  operationPromise.then(() => {
    pendingWrites--;
    if (activeUser?.uid !== userId) return;
    if (!pendingWrites) {
      try { localStorage.removeItem(recoveryKey(userId)); } catch (_) {}
      recoveryButton.hidden = true;
      applyIfIdle();
    }
  }).catch(err => {
    pendingWrites--;
    if (activeUser?.uid !== userId) return;
    blockedByError = true;
    recoveryButton.hidden = false;
    status("Falha ao salvar. Use Backup JSON ou tente recuperar.", false);
    ui.notify("Falha na sincronização: " + (err?.code || "erro de rede") + ". Seus registros continuam neste navegador para recuperação.", true);
  });
});

function watchUser(user) {
  activeUser = user;
  initialHintShown = false;
  blockedByError = false;
  pendingWrites = 0;
  snapshots = {};
  latestRemote = {items: [], events: [], batches: [], requests: [], requestEvents: []};
  recoveryChecked = false;
  recoveryButton.hidden = true;
  status("Carregando o histórico protegido…", false);
  TYPES.forEach(type => {
    const unsubscribe = onSnapshot(
      collection(firestore, "users", user.uid, type),
      {includeMetadataChanges: true},
      snap => {
        if (activeUser?.uid !== user.uid) return;
        if (snap.metadata.fromCache) {
          status("Aguardando confirmação do servidor…", false);
          return;
        }
        snapshots[type] = snap.docs.map(record => ({...record.data(), id: record.id}));
        if (pendingWrites) latestRemote = remoteData();
        else applyIfIdle();
      },
      err => {
        if (activeUser?.uid !== user.uid) return;
        blockedByError = true;
        status("Acesso ao banco indisponível: " + (err?.code || "erro"), false);
        ui.notify("Não foi possível carregar os dados do Firebase.", true);
      }
    );
    stopListeners.push(unsubscribe);
  });
}


// Configurações do Telegram por usuário Google. Apenas grupos, tópicos,
// modelos e rascunhos são guardados: credenciais MTProto, senha, API hash,
// sessões cifradas e histórico bruto das mensagens nunca vão para o Firestore.
const TG_CONFIG_TYPES = {
  routing:{
    docId:"telegramRouting",
    read:()=>window.TelegramRouting?.exportCloudConfig?.(),
    apply:value=>window.TelegramRouting?.applyCloudConfig?.(value),
    populated:value=>!!(value?.groups?.length||Object.keys(value?.mappings||{}).length||Object.keys(value?.drafts||{}).length)
  },
  monitor:{
    docId:"telegramMonitor",
    read:()=>window.TelegramConnector?.exportMonitorConfig?.(),
    apply:value=>window.TelegramConnector?.applyCloudMonitorConfig?.(value),
    populated:value=>!!value?.groups?.length
  }
};
let tgCloudStates = {};
let tgCloudListeners = [];
let tgCloudSessionId = 0;
const tgCurrentUserId = () => String(window.TelegramConnector?.getUserId?.()||"");
function tgCloudStateLine(){
  const textElement=document.getElementById("tgCloudSyncStatus");
  const actions=document.getElementById("tgCloudConflictActions");
  if(!textElement)return;
  const states=Object.values(tgCloudStates);
  const wrong=states.some(x=>x.owner && tgCurrentUserId()&&x.owner!==tgCurrentUserId());
  const conflict=states.some(x=>x.conflict);
  if(actions)actions.hidden=!conflict||wrong;
  if(!activeUser){
    textElement.textContent="Entre com a conta Google do Controle PDC para sincronizar os grupos, tópicos e destinos entre computadores.";
    return;
  }
  if(wrong){
    textElement.textContent="Atenção: esta conta Google possui configurações vinculadas a outra conta Telegram. Confirme a conta Telegram utilizada antes de continuar.";
    return;
  }
  if(conflict){
    textElement.textContent="Alterações diferentes foram feitas em computadores distintos. Sua versão local foi preservada. Escolha restaurar da nuvem ou manter e enviar deste PC.";
    return;
  }
  if(states.some(x=>x.error)){
    textElement.textContent="Sincronização de configurações indisponível: "+states.find(x=>x.error).error+
      ". Os grupos e tópicos continuam guardados neste navegador.";
    return;
  }
  if(states.length<2||states.some(x=>!x.ready)){
    textElement.textContent="Carregando grupos e tópicos da sua conta Google no Firebase…";
    return;
  }
  if(states.some(x=>x.dirty||x.writing)){
    textElement.textContent="Salvando alterações de grupos, tópicos e destinos no Firebase…";
    return;
  }
  if(states.every(x=>x.revision===0)&&
      Object.values(TG_CONFIG_TYPES).every(spec=>!spec.populated(spec.read()))){
    textElement.textContent="Nenhuma configuração do Telegram na nuvem ainda. Abra o site atualizado no computador onde já configurou os grupos e entre com a mesma conta Google. Este PC receberá os dados automaticamente.";
    return;
  }
  const stamp=states.map(x=>x.lastSaved).filter(Boolean).sort().at(-1);
  textElement.textContent="✓ Grupos, tópicos, destinos e rascunhos disponíveis nesta conta Google"+
    (stamp?" · última atualização: "+new Date(stamp).toLocaleString("pt-BR"):"")+
    ". No outro PC, entre com a mesma conta Google.";
}
window.TelegramCloudSync={refreshStatus:tgCloudStateLine};

function tgBackupConfig(uid,part,value){
  if(!TG_CONFIG_TYPES[part].populated(value))return;
  try{
    localStorage.setItem("controle-pdc-telegram-config-backup-"+uid+"-"+part,
      JSON.stringify({at:new Date().toISOString(),config:value}));
  }catch(_){}
}
function tgApplyRemote(uid,part,remote){
  const spec=TG_CONFIG_TYPES[part],local=spec.read();
  if(!remote || typeof remote!=="object"||!Array.isArray(remote.groups))
    throw new Error("Os dados recebidos da nuvem são inválidos.");
  if(canonical(local)!==canonical(remote)){
    tgBackupConfig(uid,part,local);
    spec.apply(remote);
  }
}
function tgStopCloud(){
  tgCloudSessionId++;
  for(const state of Object.values(tgCloudStates))if(state.timer)clearTimeout(state.timer);
  tgCloudListeners.forEach(unsub=>unsub());
  tgCloudListeners=[];
  tgCloudStates={};
  tgCloudStateLine();
}
function tgScheduleSave(part,wait=1100){
  const state=tgCloudStates[part];
  if(!state||!state.ready||state.conflict||state.writing||!state.dirty)return;
  if(state.timer)clearTimeout(state.timer);
  state.timer=setTimeout(()=>{state.timer=null;tgPersistConfig(part);},wait);
  tgCloudStateLine();
}
function tgLocalChanged(part){
  const state=tgCloudStates[part];
  if(!state)return;
  state.dirty=true;state.generation++;
  if(state.error)state.error="";
  tgScheduleSave(part);
  tgCloudStateLine();
}
async function tgPersistConfig(part){
  const spec=TG_CONFIG_TYPES[part],state=tgCloudStates[part];
  if(!state||!activeUser||!state.ready||state.writing||state.conflict||!state.dirty)return;
  if(!navigator.onLine){
    state.error="sem internet; a alteração local será enviada quando a conexão voltar";
    tgCloudStateLine();return;
  }
  const userId=state.userId,session=state.session;
  if(activeUser.uid!==userId||session!==tgCloudSessionId)return;
  const payload=spec.read();
  if(!payload||typeof payload!=="object")return;
  if(!spec.populated(payload)&&state.revision===0){
    state.dirty=false;tgCloudStateLine();return;
  }
  const stringified=JSON.stringify(payload);
  if(new TextEncoder().encode(stringified).byteLength>750000){
    state.error="configurações muito grandes para salvar no Firebase";
    tgCloudStateLine();return;
  }
  const currentId=tgCurrentUserId();
  if(state.owner && currentId && state.owner!==currentId){
    state.conflict=true;tgCloudStateLine();return;
  }
  const generation=state.generation,expected=state.revision,ref=state.ref;
  const savedAt=new Date().toISOString();
  state.writing=true;state.error="";tgCloudStateLine();
  try{
    const owner=await runTransaction(firestore,async transaction=>{
      const snap=await transaction.get(ref);
      const remote=snap.exists()?snap.data():null;
      if(Number(remote?.revision||0)!==expected)
        throw Object.assign(new Error("Configuração atualizada em outro computador."),{code:"controlepdc/telegram-config-conflito"});
      if(remote?.telegramUserId && currentId && String(remote.telegramUserId)!==currentId)
        throw Object.assign(new Error("Conta Telegram diferente."),{code:"controlepdc/telegram-conta-diferente"});
      const ownerId=String(remote?.telegramUserId||state.owner||currentId||"");
      transaction.set(ref,{version:1,revision:expected+1,telegramUserId:ownerId,
        updatedAt:savedAt,settings:payload});
      return ownerId;
    });
    if(session!==tgCloudSessionId||activeUser?.uid!==userId)return;
    state.owner=owner;state.revision=expected+1;state.lastSaved=savedAt;
    state.dirty=state.generation!==generation;state.conflict=false;
    if(state.dirty)tgScheduleSave(part,400);
  }catch(err){
    if(session!==tgCloudSessionId||activeUser?.uid!==userId)return;
    state.error="";
    if(err?.code==="controlepdc/telegram-config-conflito"||
       err?.code==="controlepdc/telegram-conta-diferente"){
      state.conflict=true;
    }else state.error=err?.code||String(err?.message||err);
    // Não perder uma edição: o conteúdo local permanece intocado.
    state.dirty=true;
  }finally{
    if(session===tgCloudSessionId&&activeUser?.uid===userId){
      state.writing=false;
      if(state.dirty&&!state.conflict&&!state.error)tgScheduleSave(part);
      tgCloudStateLine();
    }
  }
}
function tgStartCloud(user){
  const session=tgCloudSessionId;
  for(const [part,spec] of Object.entries(TG_CONFIG_TYPES)){
    const ref=doc(firestore,"users",user.uid,"settings",spec.docId);
    const state={userId:user.uid,session,ref,ready:false,revision:0,owner:"",lastSaved:"",
      dirty:false,generation:0,writing:false,conflict:false,error:"",timer:null};
    tgCloudStates[part]=state;
    const unsub=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
      if(session!==tgCloudSessionId||activeUser?.uid!==user.uid||
        snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
      const remote=snapshot.exists()?snapshot.data():null;
      const owner=String(remote?.telegramUserId||"");
      const actual=tgCurrentUserId();
      if(owner && actual && owner!==actual){
        state.owner=owner;state.conflict=true;state.error="";state.ready=true;
        tgCloudStateLine();return;
      }
      if(!state.ready){
        state.ready=true;state.owner=owner;
        state.revision=Number(remote?.revision||0);
        state.lastSaved=remote?.updatedAt||"";
        try{
          if(remote){
            if(state.dirty){state.conflict=true;}
            else tgApplyRemote(user.uid,part,remote.settings);
          }else if(spec.populated(spec.read())){state.dirty=true;state.generation++;}
        }catch(err){state.error=String(err.message||err);}
        if(state.dirty&&!state.conflict&&!state.error)tgScheduleSave(part,250);
      }else if(!state.writing && remote && Number(remote.revision||0)!==state.revision){
        if(state.dirty){state.conflict=true;}
        else{
          try{
            tgApplyRemote(user.uid,part,remote.settings);
            state.revision=Number(remote.revision)||0;
            state.owner=owner;
            state.lastSaved=remote.updatedAt||"";
            state.error="";
          }catch(err){state.error=String(err.message||err);}
        }
      }else if(!state.writing && !remote && state.revision>0){
        state.conflict=true;
      }
      tgCloudStateLine();
    },err=>{
      if(session!==tgCloudSessionId||activeUser?.uid!==user.uid)return;
      state.error=err?.code||String(err.message||err);
      tgCloudStateLine();
    });
    tgCloudListeners.push(unsub);
  }
  tgCloudStateLine();
}

window.addEventListener("pdc-telegram-config-changed",event=>{
  if(!activeUser || !Object.hasOwn(TG_CONFIG_TYPES,event?.detail?.section))return;
  tgLocalChanged(event.detail.section);
});
window.addEventListener("tg-connection-changed",event=>{
  if(!activeUser)return;
  const id=tgCurrentUserId();
  for(const [part,state] of Object.entries(tgCloudStates)){
    if(state.owner && id && state.owner!==id){state.conflict=true;continue;}
    if(id && !state.owner && state.ready && TG_CONFIG_TYPES[part].populated(TG_CONFIG_TYPES[part].read()))
      tgLocalChanged(part);
  }
  tgCloudStateLine();
});
window.addEventListener("online",()=>{
  for(const part of Object.keys(tgCloudStates)){
    const st=tgCloudStates[part];
    if(st?.dirty&&!st.conflict){st.error="";tgScheduleSave(part,250);}
  }
});

async function tgResolveConflict(keepLocal){
  if(!activeUser||!navigator.onLine)return;
  const uid=activeUser.uid;
  if(keepLocal&&!confirm("Enviar as configurações DESTE PC para a nuvem? Isso substituirá as configurações remotas dos mesmos grupos/tópicos."))
    return;
  for(const [part,state] of Object.entries(tgCloudStates)){
    if(!state.conflict)continue;
    try{
      const snap=await getDocFromServer(state.ref);
      const remote=snap.exists()?snap.data():null;
      if(remote?.telegramUserId&&tgCurrentUserId()&&remote.telegramUserId!==tgCurrentUserId())
        throw new Error("Conta Telegram diferente; conecte a conta correta.");
      if(!keepLocal){
        if(remote)tgApplyRemote(uid,part,remote.settings);
        state.dirty=false;
      }else{
        state.dirty=true;state.generation++;
      }
      state.revision=Number(remote?.revision||0);
      state.owner=String(remote?.telegramUserId||"");
      state.lastSaved=remote?.updatedAt||"";
      state.conflict=false;state.error="";
      if(keepLocal)tgScheduleSave(part,100);
    }catch(err){state.error=String(err.message||err);}
  }
  tgCloudStateLine();
}
document.addEventListener("click",event=>{
  if(event.target.closest("#tgCloudUseRemote"))tgResolveConflict(false);
  if(event.target.closest("#tgCloudUseLocal"))tgResolveConflict(true);
});

onAuthStateChanged(auth, user => {
  stopWatching();
  tgStopCloud();
  if (!user) {
    activeUser = null;
    blockedByError = false;
    pendingWrites = 0;
    ui.clearCloud();
    recoveryButton.hidden = true;
    status("Faça login para acessar seus registros.", false);
    return;
  }
  watchUser(user);
  tgStartCloud(user);
}, err => {
  blockedByError = true;
  status("Erro de autenticação: " + (err?.code || "desconhecido"), false);
});

recoveryButton.addEventListener("click", async () => {
  if (!activeUser || pendingWrites || !navigator.onLine) return ui.notify("Conecte-se à internet antes de recuperar.", true);
  let saved;
  try { saved = JSON.parse(localStorage.getItem(recoveryKey(activeUser.uid)) || "null"); }
  catch (_) {}
  if (!saved?.before || !saved?.after) return ui.notify("Não há alterações pendentes para recuperar.");
  const operations = recordChanges(saved.before, saved.after);
  blockedByError = false;
  recoveryButton.disabled = true;
  pendingWrites = 1;
  status("Tentando recuperar alterações…", false);
  try {
    await pushChanges(activeUser.uid, operations);
    await refreshFromServer(activeUser.uid);
    localStorage.removeItem(recoveryKey(activeUser.uid));
    recoveryButton.hidden = true;
    recoveryChecked = true;
    pendingWrites = 0;
    if (allCollectionsLoaded()) latestRemote = remoteData();
    applyIfIdle();
    ui.notify("Alterações recuperadas e enviadas ao Firebase.");
  } catch (err) {
    blockedByError = true;
    pendingWrites = 0;
    status("Recuperação não concluída. Faça Backup JSON antes de sair.", false);
    ui.notify("Não foi possível recuperar: " + (err?.code || "erro") + ". A cópia local foi preservada.", true);
  } finally { recoveryButton.disabled = false; }
});
document.getElementById("loginButton").addEventListener("click", async () => {
  try {
    status("Abrindo login Google…", false);
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    status("Não foi possível entrar. Tente novamente.", false);
    if (err?.code !== "auth/popup-closed-by-user") ui.notify("Login Google: " + (err?.code || "falha inesperada"), true);
  }
});
document.getElementById("logoutButton").addEventListener("click", async () => {
  if (pendingWrites) return ui.notify("Aguarde o salvamento antes de sair.", true);
  try { await signOut(auth); }
  catch (err) { ui.notify("Não foi possível sair da conta.", true); }
});

window.addEventListener("offline", () => {
  if (activeUser) status("Sem internet. Volte a se conectar para editar.", false);
});
window.addEventListener("online", () => {
  if (activeUser && !blockedByError) status("Reconectando ao Firebase…", false);
});
