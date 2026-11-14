/* Central Telegram: roteamento local de modelos para grupos configurados.
   Sem acesso real ao Telegram nesta etapa. A integração futura exige backend autorizado. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const page=$("telegramPage"), pane=$("tgWorkspace"), side=$("tgSidebar"), groupsEl=$("tgGroupList");
  if(!page||!pane||!side||!groupsEl)return;
  const STORAGE="controle-pdc-telegram-destinos-v1";
  const models=[
    {id:"cadastro",name:"Cadastro de Produto",category:"Cadastros",kind:"cadastro"},
    {id:"grade",name:"Cadastro em Grade",category:"Cadastros"},
    {id:"cb",name:"Atualização de CB",category:"Códigos e Identificação",kind:"cb"},
    {id:"ean",name:"Adicionar CI ou CB no EAN",category:"Códigos e Identificação"},
    {id:"preco",name:"Ajuste de Preço",category:"Preços e Custos"},
    {id:"verificarPreco",name:"Verificação de Preço",category:"Preços e Custos"},
    {id:"custo",name:"Adicionar Valor de Custo",category:"Preços e Custos"},
    {id:"desmembrar",name:"Desmembramento em Grade",category:"Grades e Unidades"},
    {id:"promoEntrar",name:"Entrada de Promoção",category:"Promoções e Validades"},
    {id:"promoSair",name:"Retirada de Promoção",category:"Promoções e Validades"},
    {id:"validadeAdd",name:"Adição de Validade",category:"Promoções e Validades"},
    {id:"validadeRemove",name:"Remoção de Validade",category:"Promoções e Validades"},
    {id:"nome",name:"Alteração de Nomenclatura",category:"Dados do Produto",kind:"nome"}
  ];
  const modelMap=new Map(models.map(m=>[m.id,m]));
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const val=v=>String(v??"").trim();
  function load(){
    try{
      const s=JSON.parse(localStorage.getItem(STORAGE)||"{}");
      const groups=(Array.isArray(s.groups)?s.groups:[]).filter(g=>g&&typeof g.id==="string"&&typeof g.name==="string").slice(0,40).map(g=>({id:g.id,name:g.name.slice(0,80),telegramId:typeof g.telegramId==="string"?g.telegramId:"",telegramName:typeof g.telegramName==="string"?g.telegramName:"",topicId:g.topicId==null?null:String(g.topicId),topicName:typeof g.topicName==="string"?g.topicName:"",isForum:!!g.isForum}));
      const ids=new Set(groups.map(g=>g.id));
      const mappings={};
      const prior=s.mappings&&typeof s.mappings==="object"?s.mappings:{};
      for(const m of models)if(ids.has(prior[m.id]))mappings[m.id]=prior[m.id];
      const drafts=s.drafts&&typeof s.drafts==="object"&&!Array.isArray(s.drafts)?s.drafts:{};
      return {groups,mappings,drafts};
    }catch(_){return {groups:[],mappings:{},drafts:{}};}
  }
  const state=load();
  let section="solicitacoes", groupId=state.groups[0]?.id||"", modelId="cadastro";
  const topicCache=new Map();
  function store(){
    try{localStorage.setItem(STORAGE,JSON.stringify(state));return true;}
    catch(_){alert("Não foi possível salvar neste navegador.");return false;}
  }
  function uid(){return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);}
  function getGroup(id){return state.groups.find(g=>g.id===id)||null;}
  function destination(id){return getGroup(state.mappings[id]);}
  function model(){return modelMap.get(modelId)||models[0];}
  function draft(){
    let existing=state.drafts[modelId];
    if(!existing || typeof existing!=="object" || !Array.isArray(existing.rows)){
      const old=state.drafts[state.mappings[modelId]];
      existing=old&&Array.isArray(old.rows)&&modelId==="cb"?{rows:old.rows.map(r=>({...r}))}:{rows:[{}],freeText:""};
      state.drafts[modelId]=existing;
    }
    if(!existing.rows.length)existing.rows=[{}];
    return existing;
  }
  function closeMobile(){
    side.classList.remove("open");
    const toggle=$("tgMenuToggle");if(toggle)toggle.setAttribute("aria-expanded","false");
  }
  function notice(txt,error=false){
    const el=$("tgNotice");
    if(el){el.textContent=txt;el.classList.toggle("error",error);}
  }
  function menu(){
    side.querySelectorAll("[data-tg-section]").forEach(b=>{
      const active=b.dataset.tgSection===section;
      b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");
    });
    groupsEl.innerHTML=state.groups.map(g=>{
      const n=models.filter(m=>state.mappings[m.id]===g.id).length;
      return '<button type="button" class="tg-group-button '+(section==="grupos"&&groupId===g.id?"active":"")+'" data-tg-group="'+esc(g.id)+'"><span>'+esc(g.name)+'</span><small>'+(g.telegramId?(esc(g.telegramName||"Grupo")+(g.topicName?' / '+esc(g.topicName):'')):'Não vinculado')+' · '+n+' modelo(s)</small></button>';
    }).join("") || '<p class="tg-empty-groups">Nenhum grupo cadastrado.</p>';
  }
  function header(title,description){
    return '<div class="tg-workspace-head"><div><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p></div></div>';
  }
  function routeBox(){
    const g=destination(modelId);
    const actual=g?.telegramId?window.TelegramConnector?.groups?.().find(x=>x.id===g.telegramId):null;
    const forum=actual?.isForum??g?.isForum;
    const ready=!!g?.telegramId && (!forum||g.topicId!=null);
    const detail=g?.telegramId ? esc(g.telegramName||g.name)+(g.topicName?' / '+esc(g.topicName):'') : "";
    return '<div class="tg-route '+(ready?"assigned":"unassigned")+'"><div><small>DESTINO AUTOMÁTICO</small><strong>'+(g?esc(g.name):'Nenhum grupo associado')+'</strong><p>'+(g?(ready?'Telegram: '+detail:'Selecione o tópico dentro do grupo antes do envio.'):'Configure um grupo ou tópico para receber este modelo.')+'</p></div><span class="tg-route-mark">'+(ready?'✓ Vinculado':'! Pendente')+'</span></div>';
  }
  function itemInputs(){
    const m=model(),d=draft();
    return d.rows.map((r,i)=>'<div class="tg-product"><div class="tg-product-head"><strong>Item '+(i+1)+'</strong>'+(d.rows.length>1?'<button type="button" class="tg-text-button" data-tg-remove-row="'+i+'">Remover</button>':'')+'</div>'+
      '<div class="tg-fields"><label>CI<input autocomplete="off" inputmode="numeric" data-tg-row="'+i+'" data-tg-key="ci" value="'+esc(r.ci||"")+'" placeholder="Código interno"></label>'+
      '<label>Nome original do produto<input autocomplete="off" data-tg-row="'+i+'" data-tg-key="name" value="'+esc(r.name||"")+'" placeholder="Descrição exata do produto"></label>'+
      '<label>CB (quando disponível)<input autocomplete="off" inputmode="numeric" data-tg-row="'+i+'" data-tg-key="cb" value="'+esc(r.cb||"")+'" placeholder="Código de barras"></label>'+
      (m.kind==="nome"?'<label>Novo nome solicitado<input autocomplete="off" data-tg-row="'+i+'" data-tg-key="newName" value="'+esc(r.newName||"")+'" placeholder="Descrição desejada"></label>':'')+'</div></div>').join("");
  }
  function formatItem(r,kind){
    const ci=val(r.ci),name=val(r.name),cb=val(r.cb);
    const line=ci+(name?" - "+name:"");
    if(!ci && !name && !cb)return "";
    if(kind==="nome")return "CI - "+ci+"\n\nDE:\n"+name+"\n\nPARA:\n"+val(r.newName);
    return line+(cb?(line?"\n":"")+"CB: "+cb:"");
  }
  function getMessage(){
    const m=model(),d=draft();
    if(!m.kind)return val(d.freeText);
    const list=d.rows.map(r=>formatItem(r,m.kind)).filter(Boolean);
    const title={cb:"Por favor, atualizar CB:",cadastro:"Por favor, cadastrar:",nome:"Por favor, alterar nomenclatura:"}[m.kind];
    return title+(list.length?"\n\n"+list.join("\n\n"):"");
  }
  function updatePreview(){
    const pre=$("tgPreview");if(pre)pre.textContent=getMessage();
  }
  function renderCompose(){
    const m=model(),dest=destination(modelId);
    const options=models.map(x=>'<option value="'+esc(x.id)+'"'+(x.id===m.id?" selected":"")+'>'+esc(x.name)+'</option>').join("");
    pane.innerHTML=header("Nova solicitação","Selecione o modelo; o grupo de destino será preenchido automaticamente.")+
      '<div class="tg-editor-toolbar"><label>Tipo de solicitação<select id="tgModelSelect">'+options+'</select></label></div>'+
      routeBox()+
      '<div class="tg-information tg-info-inline"><strong>Envio com confirmação</strong><p>Se a conta estiver conectada e o destino vinculado, você poderá revisar e enviar a mensagem ao grupo. Sem conexão, use o botão Copiar.</p></div>'+
      (m.kind?'<div id="tgRows" class="tg-rows">'+itemInputs()+'</div><button type="button" class="btn btn-soft btn-small" id="tgAddRow">+ Adicionar item</button>':
       '<div class="tg-custom"><label>Conteúdo da solicitação — modelo ainda sem variáveis automatizadas<textarea data-tg-field="freeText" rows="8" placeholder="Preencha o texto deste modelo manualmente até definirmos suas variáveis.">'+esc(draft().freeText||"")+'</textarea></label><small>As variáveis deste modelo serão configuradas posteriormente, sem alterar os modelos já definidos.</small></div>')+
      '<div class="tg-preview-panel"><div class="tg-preview-head"><strong>Mensagem e destino</strong><span>Prévia antes do envio</span></div><pre id="tgPreview"></pre></div>'+
      '<div class="tg-editor-actions"><button type="button" class="btn btn-soft" id="tgSaveDraft">Salvar rascunho</button><button type="button" class="btn btn-primary" id="tgCopyMessage">Copiar mensagem</button><button type="button" class="btn btn-soft" id="tgSendMessage">Enviar pelo Telegram</button></div>'+
      '<p id="tgNotice" class="tg-notice" role="status" aria-live="polite"></p>';
    updatePreview();
  }
  function renderGroups(){
    const selected=getGroup(groupId);
    pane.innerHTML=header("Grupos e modelos","Defina quais tipos de solicitação cada grupo receberá. Um modelo só pode ter um destino por vez.")+
      '<div class="tg-information tg-info-inline"><strong>Grupos reais do Telegram</strong><p>Conecte sua conta em Configurações. Depois selecione abaixo uma conversa da lista autorizada para vinculá-la ao destino configurado.</p></div>'+
      '<div id="tgRealGroupChooser"></div>'+
      (selected?'<div class="tg-group-setup-head"><div><small>GRUPO SELECIONADO</small><h4>'+esc(selected.name)+'</h4></div><div class="tg-group-actions"><button type="button" id="tgRenameGroup" class="btn btn-ghost btn-small">Renomear</button><button type="button" id="tgDeleteGroup" class="btn btn-ghost btn-small">Excluir</button></div></div>'+
        '<p class="tg-config-explain">Destino real: <b>'+(selected.telegramId?esc(selected.telegramName||'Grupo')+(selected.topicName?' / '+esc(selected.topicName):selected.isForum?' / tópico não selecionado':''):'ainda não vinculado')+'</b>. Você pode vincular vários destinos ao mesmo grupo, escolhendo tópicos diferentes. Cada destino recebe os modelos marcados abaixo.</p>'+
        '<div class="tg-model-list">'+models.map(m=>{
          const assigned=destination(m.id),checked=assigned?.id===selected.id;
          return '<label class="tg-model-assignment"><input type="checkbox" data-tg-map="'+esc(m.id)+'" '+(checked?"checked":"")+'><span><strong>'+esc(m.name)+'</strong><small>'+esc(m.category)+'</small></span><em>'+(assigned&&!checked?'Em: '+esc(assigned.name):checked?'Destino definido':'Livre')+'</em></label>';
        }).join("")+'</div>':
        '<div class="tg-information"><strong>Configure um grupo</strong><p>Clique em + Grupo na sidebar para cadastrar um destino e marcar os modelos que deverão ir para ele.</p></div>');
  }
  function renderMonitoring(){
    pane.innerHTML=header("Monitoramento","Histórico de solicitações, reações e alterações por mensagem.")+
      '<div id="tgMonitorMount"></div>';
    window.TelegramConnector?.renderMonitor?.();
  }
  function renderSettings(){
    pane.innerHTML=header("Configurações","Conexão de conta e sincronização sob demanda no navegador.")+
      '<div id="tgAuthMount"></div>'+
      '<div class="tg-route assigned"><div><small>ROTEAMENTO DEFINIDO</small><strong>'+Object.keys(state.mappings).length+' modelo(s) com destino</strong><p>Ao escolher o modelo, o site identifica o grupo configurado sem seleção manual.</p></div></div>';
    window.TelegramConnector?.renderLogin?.();
  }
  function render(){
    menu();
    if(section==="grupos"){renderGroups();renderRealGroupChooser();}
    else if(section==="monitoramento")renderMonitoring();
    else if(section==="configuracoes")renderSettings();
    else renderCompose();
  }
  function renderRealGroupChooser(){
    const mount=$("tgRealGroupChooser");if(!mount)return;
    const connected=window.TelegramConnector?.connected?.();
    if(!connected){mount.innerHTML='<p class="tg-muted">Conecte a conta em Configurações para escolher grupos e tópicos.</p>';return;}
    const available=window.TelegramConnector.groups();
    const selected=getGroup(groupId);
    mount.innerHTML='<div class="tg-real-picker"><label>1. Selecione o grupo<select id="tgRealGroupSelect"><option value="">Escolha uma conversa</option>'+available.map(g=>'<option value="'+esc(g.id)+'"'+(selected?.telegramId===g.id?' selected':'')+'>'+esc(g.name)+(g.isForum?' (com tópicos)':'')+'</option>').join("")+'</select></label><div id="tgRealTopicChooser" class="tg-topic-chooser"></div><button type="button" id="tgRefreshTopics" class="btn btn-ghost btn-small">↻ Atualizar tópicos</button><button type="button" id="tgLinkRealGroup" class="btn btn-soft btn-small">Vincular destino</button></div>';
    if(selected?.telegramId)loadTopicChoices();
  }
  async function loadTopicChoices(){
    const dropdown=$("tgRealGroupSelect"),mount=$("tgRealTopicChooser");
    if(!dropdown||!mount)return;
    const id=dropdown.value,actual=window.TelegramConnector?.groups?.().find(g=>g.id===id);
    if(!actual){mount.innerHTML="";return;}
    if(!actual.isForum){
      mount.innerHTML='<p class="tg-muted">Este grupo não possui tópicos. O destino será a conversa principal.</p>';
      return;
    }
    mount.innerHTML='<p class="tg-muted">Consultando tópicos do grupo…</p>';
    try{
      let found=topicCache.get(id);
      if(!found){
        found=await window.TelegramConnector.topics(id);
        topicCache.set(id,found);
      }
      if($("tgRealGroupSelect")?.value!==id)return;
      if(!found.length){mount.innerHTML='<p class="tg-auth-message error">Não foi possível localizar tópicos. Confira se este grupo está no modo Fórum.</p>';return;}
      const old=getGroup(groupId);
      mount.innerHTML='<label>2. Escolha o tópico (subchat)<select id="tgRealTopicSelect"><option value="">Selecione um tópico…</option>'+found.map(t=>'<option value="'+esc(t.id)+'"'+(old?.telegramId===id&&String(old.topicId)===String(t.id)?' selected':'')+(t.closed?' disabled':'')+'>'+esc(t.name)+(t.closed?' (fechado)':'')+'</option>').join("")+'</select></label>';
    }catch(err){mount.innerHTML='<p class="tg-auth-message error">Não foi possível listar os tópicos: '+esc(err.message||err)+'</p>';}
  }
  window.TelegramRouting={groups:()=>state.groups.map(g=>({...g})),refresh:render};
  window.addEventListener("tg-connection-changed",()=>render());
  window.addEventListener("tg-groups-updated",()=>{if(section==="grupos")renderRealGroupChooser();});
  $("tgAddGroup").addEventListener("click",()=>{
    const raw=prompt("Nome do grupo de destino:","");if(raw===null)return;
    const name=val(raw);if(!name||name.length>80)return alert("Informe um nome de até 80 caracteres.");
    if(state.groups.some(g=>g.name.toLowerCase()===name.toLowerCase()))return alert("Já existe um grupo com esse nome.");
    if(state.groups.length>=40)return alert("Limite de 40 grupos nesta versão.");
    const g={id:uid(),name};state.groups.push(g);groupId=g.id;section="grupos";store();render();closeMobile();
  });
  groupsEl.addEventListener("click",e=>{
    const btn=e.target.closest("[data-tg-group]");if(!btn)return;
    groupId=btn.dataset.tgGroup;section="grupos";render();closeMobile();
  });
  side.addEventListener("click",e=>{
    const item=e.target.closest("[data-tg-section]");if(!item)return;
    section=item.dataset.tgSection;render();closeMobile();
  });
  const toggle=$("tgMenuToggle");
  if(toggle)toggle.addEventListener("click",()=>{
    const open=side.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open));
  });
  pane.addEventListener("change",e=>{
    const el=e.target;
    if(el.id==="tgRealGroupSelect"){loadTopicChoices();return;}
    if(el.id==="tgModelSelect"){
      if(!modelMap.has(el.value))return;
      modelId=el.value;render();return;
    }
    if(el.dataset.tgMap){
      const key=el.dataset.tgMap,selected=getGroup(groupId);
      if(!selected||!modelMap.has(key))return;
      const previous=destination(key);
      if(el.checked){
        if(previous&&previous.id!==selected.id&&!confirm("O modelo "+modelMap.get(key).name+" já pertence ao grupo "+previous.name+". Transferir para "+selected.name+"?")){
          el.checked=false;return;
        }
        state.mappings[key]=selected.id;
      } else if(state.mappings[key]===selected.id)delete state.mappings[key];
      store();render();return;
    }
  });
  pane.addEventListener("input",e=>{
    const el=e.target,d=draft();
    if(el.dataset.tgRow!==undefined){
      const i=Number(el.dataset.tgRow),key=el.dataset.tgKey;
      if(!Number.isInteger(i)||i<0||i>=d.rows.length||!["ci","name","cb","newName"].includes(key))return;
      d.rows[i][key]=el.value;
    }else if(el.dataset.tgField==="freeText")d.freeText=el.value;
    else return;
    store();updatePreview();
  });
  pane.addEventListener("click",async e=>{
    const remove=e.target.closest("[data-tg-remove-row]");
    if(remove){
      const i=Number(remove.dataset.tgRemoveRow),d=draft();
      if(d.rows.length>1 && i>=0 && i<d.rows.length){d.rows.splice(i,1);store();renderCompose();}
      return;
    }
    if(e.target.closest("#tgAddRow")){draft().rows.push({});store();renderCompose();return;}
    if(e.target.closest("#tgRefreshTopics")){const id=$("tgRealGroupSelect")?.value||"";if(id)topicCache.delete(id);await loadTopicChoices();return;}
    if(e.target.closest("#tgLinkRealGroup")){
      const g=getGroup(groupId),id=$("tgRealGroupSelect")?.value||"";
      const actual=window.TelegramConnector?.groups?.().find(x=>x.id===id);
      if(!g||!actual)return alert("Escolha um grupo real.");
      const topicId=actual.isForum?($("tgRealTopicSelect")?.value||""):null;
      if(actual.isForum&&!topicId)return alert("Escolha o tópico (subchat) antes de vincular.");
      const selectedTopic=actual.isForum?topicCache.get(id)?.find(t=>String(t.id)===topicId):null;
      if(actual.isForum&&!selectedTopic)return alert("Tópico não encontrado. Atualize a lista e tente novamente.");
      if(state.groups.some(x=>x.id!==g.id&&x.telegramId===id&&String(x.topicId??"")===String(topicId??"")))
        return alert("Este grupo e tópico já estão vinculados a outro destino. Edite os modelos desse destino.");
      g.telegramId=id;g.telegramName=actual.name;g.isForum=actual.isForum;
      g.topicId=topicId;g.topicName=selectedTopic?.name||"";
      store();render();return;
    }
    if(e.target.closest("#tgSaveDraft")){store();notice("Rascunho salvo neste navegador.");return;}
    if(e.target.closest("#tgRenameGroup")){
      const g=getGroup(groupId);if(!g)return;
      const raw=prompt("Novo nome do grupo:",g.name);if(raw===null)return;
      const name=val(raw);if(!name||name.length>80)return alert("Nome inválido.");
      if(state.groups.some(x=>x.id!==g.id&&x.name.toLowerCase()===name.toLowerCase()))return alert("Nome já utilizado.");
      g.name=name;store();render();return;
    }
    if(e.target.closest("#tgDeleteGroup")){
      const g=getGroup(groupId);if(!g||!confirm("Excluir "+g.name+" e remover seus vínculos? Solicitações do Controle PDC não serão afetadas."))return;
      state.groups=state.groups.filter(x=>x.id!==g.id);
      for(const m of Object.keys(state.mappings))if(state.mappings[m]===g.id)delete state.mappings[m];
      groupId=state.groups[0]?.id||"";store();render();return;
    }
    if(e.target.closest("#tgSendMessage")){
      const dest=destination(modelId);
      const actual=window.TelegramConnector?.groups?.().find(x=>x.id===dest?.telegramId);
      if(!dest||!dest.telegramId||((actual?.isForum??dest.isForum)&&dest.topicId==null))return notice("Vincule o grupo e seu tópico para este modelo.",true);
      if(!window.TelegramConnector?.connected?.())return notice("Conecte o Telegram na aba Configurações.",true);
      const txt=getMessage();if(!txt.trim())return notice("Preencha o texto da solicitação.",true);
      const d=draft(),m=model();if(m.kind){const items=d.rows.filter(r=>val(r.ci)||val(r.name)||val(r.cb)||val(r.newName));if(!items.length||items.some(r=>!val(r.ci)||!val(r.name)||(m.kind==="cb"&&!val(r.cb))||(m.kind==="nome"&&!val(r.newName))))return notice("Complete os campos obrigatórios dos produtos.",true);}
      const destinationLabel=(dest.telegramName||dest.name)+(dest.topicName?" / "+dest.topicName:"");
      if(!confirm("Enviar esta solicitação para "+destinationLabel+"?\n\n"+txt))return;
      try{const result=await window.TelegramConnector.send(dest.telegramId,txt,dest.topicId??null);notice("Mensagem enviada para "+destinationLabel+" (ID "+result.id+"). Sincronize o monitor para acompanhar as reações.");}
      catch(err){notice("Falha no envio: "+String(err.message||err),true);}return;
    }
    if(e.target.closest("#tgCopyMessage")){
      if(!destination(modelId))return notice("Associe um grupo de destino a este modelo antes de copiar para envio.",true);
      const m=model(),d=draft();
      if(m.kind){
        const items=d.rows.filter(r=>val(r.ci)||val(r.name)||val(r.cb)||val(r.newName));
        if(!items.length||items.some(r=>!val(r.ci)||!val(r.name)||(m.kind==="cb"&&!val(r.cb))||(m.kind==="nome"&&!val(r.newName)))){
          return notice("Complete CI, nome e os campos obrigatórios de cada item.",true);
        }
      }else if(!val(d.freeText))return notice("Informe o conteúdo do modelo antes de copiar.",true);
      try{await navigator.clipboard.writeText(getMessage());notice("Mensagem copiada. Destino previsto: "+destination(modelId).name+". Nenhum envio realizado.");}
      catch(_){notice("Não foi possível copiar. Verifique a permissão do navegador.",true);}
    }
  });
  render();
})();