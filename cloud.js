import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, getDocsFromServer, runTransaction } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

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
const TYPES = ["items", "events", "batches"];
let activeUser = null;
let stopListeners = [];
let snapshots = {};
let pendingWrites = 0;
let latestRemote = {items: [], events: [], batches: []};
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
    batches: (snapshots.batches || []).map(x => ({...x}))
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
  if (!operations.length) { applyIfIdle(); return; }
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
  latestRemote = {items: [], events: [], batches: []};
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

onAuthStateChanged(auth, user => {
  stopWatching();
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
