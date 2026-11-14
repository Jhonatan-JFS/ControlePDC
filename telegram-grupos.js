/* Central Telegram: roteamento local de modelos para grupos configurados.
   Sem acesso real ao Telegram nesta etapa. A integração futura exige backend autorizado. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const page=$("telegramPage"), pane=$("tgWorkspace"), side=$("tgSidebar"), groupsEl=$("tgGroupList");
  if(!page||!pane||!side||!groupsEl)return;
  const STORAGE="controle-pdc-telegram-destinos-v1";
  const templates=window.TelegramTemplates;
  if(!templates){pane.innerHTML="<p>Não foi possível carregar os modelos de solicitações. Atualize a página.</p>";return;}
  const models=templates.models;
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
    let d=state.drafts[modelId];
    if(!d||typeof d!=="object"){
      const prior=state.drafts[state.mappings[modelId]];
      d=prior&&Array.isArray(prior.rows)&&modelId==="cb"?{...templates.defaults(modelId),rows:prior.rows.map(r=>({...r}))}:templates.defaults(modelId);
      state.drafts[modelId]=d;
    }
    if(!Array.isArray(d.rows)||!d.rows.length)d.rows=[{}];
    // Compatibilidade com rascunhos das versões anteriores do editor Telegram.
    if(modelId==="cb")d.rows.forEach(r=>{if(!r.newCB&&r.cb)r.newCB=r.cb;});
    if(modelId==="nome"&&d.rows[0]){
      if(!d.ci&&d.rows[0].ci)d.ci=d.rows[0].ci;
      if(!d.oldName&&d.rows[0].name)d.oldName=d.rows[0].name;
      if(!d.newName&&d.rows[0].newName)d.newName=d.rows[0].newName;
    }
    if(!d.unit)d.unit="Un";
    if(!d.eanMode)d.eanMode="CI";
    return d;
  }
  let modelSearch="", modelCategory="all", openModelCategory="Cadastros";
  function closeMobile(){
    if(window.innerWidth>760)return;
    side.classList.remove("open");
    $("tgMenuToggle")?.setAttribute("aria-expanded","false");
  }
  function updateMenuState(){
    const mobile=window.innerWidth<=760;
    const expanded=mobile?side.classList.contains("open"):!page.classList.contains("sidebar-collapsed");
    $("tgMenuToggle")?.setAttribute("aria-expanded",String(expanded));
    $("tgMenuToggle")?.setAttribute("aria-label",expanded?"Esconder menu Telegram":"Mostrar menu Telegram");
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
  function getMessage(){return templates.message(modelId,draft());}
  function updatePreview(){const el=$("tgPreview");if(el)el.textContent=getMessage();}
  function renderModelChoices(){
    const mount=$("tgModelChoices");if(!mount)return;
    const norm=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    mount.innerHTML=templates.categories.map(cat=>{
      if(modelCategory!=="all"&&modelCategory!==cat.name)return "";
      const visible=cat.ids.filter(id=>norm(modelMap.get(id)?.name).includes(norm(modelSearch))||norm(cat.name).includes(norm(modelSearch)));
      if(!visible.length)return "";
      const expanded=openModelCategory===cat.name||!!modelSearch;
      return '<div class="req-model-group"><button type="button" class="req-group-title" data-tg-cat="'+esc(cat.name)+'" aria-expanded="'+expanded+'"><strong>'+esc(cat.name)+'</strong><span>'+visible.length+' modelos '+(expanded?'⌃':'⌄')+'</span></button>'+
        (expanded?'<div class="req-model-choices">'+visible.map(id=>'<button type="button" class="req-model-chip '+(id===modelId?'active':'')+'" data-tg-model="'+id+'">'+esc(modelMap.get(id).name)+'</button>').join("")+'</div>':"")+'</div>';
    }).join("")||'<p class="req-muted">Nenhum modelo encontrado.</p>';
  }
  function renderCompose(){
    const m=model();
    const categoryOptions='<option value="all">Todas as categorias</option>'+templates.categories.map(c=>'<option value="'+esc(c.name)+'"'+(modelCategory===c.name?' selected':'')+'>'+esc(c.name)+'</option>').join("");
    pane.innerHTML=header("Nova solicitação","Mesmos modelos e campos de Solicitações. O destino é determinado automaticamente pelo modelo escolhido.")+
      '<div class="tg-compose-layout"><aside class="tg-model-catalog"><div class="tg-setup-eyebrow">ESCOLHA O MODELO</div>'+
      '<div class="tg-model-filters"><input id="tgModelSearch" type="search" placeholder="Buscar modelo…" value="'+esc(modelSearch)+'" aria-label="Buscar modelo"><select id="tgModelCategory" aria-label="Filtrar categorias">'+categoryOptions+'</select></div><div id="tgModelChoices"></div></aside>'+
      '<section class="tg-compose-form">'+
      '<div id="tgRequestForm">'+templates.form(modelId,draft())+'</div>'+
      routeBox()+
      '<div class="tg-preview-panel"><div class="tg-preview-head"><strong>Prévia da mensagem</strong><span>Separação entre produtos preservada</span></div><pre id="tgPreview"></pre></div>'+
      '<div class="tg-editor-actions"><button type="button" class="btn btn-soft" id="tgSaveDraft">Salvar rascunho</button><button type="button" class="btn btn-ghost" id="tgCopyMessage">Copiar mensagem</button><button type="button" class="btn btn-primary" id="tgSendMessage">Enviar pelo Telegram</button></div>'+
      '<p id="tgNotice" class="tg-notice" role="status" aria-live="polite"></p></section></div>';
    renderModelChoices();updatePreview();
  }
  function routingSummary(){
    const rows=state.groups.map(g=>{
      const attached=models.filter(m=>state.mappings[m.id]===g.id);
      const valid=!!g.telegramId && (!g.isForum||g.topicId!=null);
      const actual=g.telegramName||g.name;
      const topic=g.topicName?" / "+g.topicName:g.isForum?" / Tópico não selecionado":"";
      return '<button type="button" class="tg-overview-card '+(g.id===groupId?"selected":"")+'" data-tg-destination="'+esc(g.id)+'">'+
        '<div class="tg-overview-head"><strong>'+esc(g.name)+'</strong><span class="tg-status-text '+(valid?"ready":"pending")+'">'+(valid?"Vinculado":"Pendente")+'</span></div>'+
        '<small>'+esc(actual+topic)+'</small>'+
        '<div class="tg-overview-tags">'+(attached.length?attached.map(m=>'<span>'+esc(m.name)+'</span>').join(""):'<em>Nenhum modelo associado</em>')+'</div></button>';
    }).join("");
    return '<section class="tg-setup-section"><div class="tg-step-header"><span class="tg-step-number">✓</span><div><h4>Visão geral dos destinos</h4><p>Confira de uma vez para onde cada modelo será enviado.</p></div></div>'+
      '<div class="tg-summary-counts"><span>'+state.groups.length+' destino(s)</span><span>'+Object.keys(state.mappings).length+' modelo(s) vinculado(s)</span><span>'+(models.length-Object.keys(state.mappings).length)+' sem destino</span></div>'+
      '<div class="tg-overview-grid">'+(rows||'<p class="tg-muted">Nenhum destino criado ainda.</p>')+'</div></section>';
  }
  function renderGroups(){
    const selected=getGroup(groupId);
    const select=state.groups.map(g=>'<option value="'+esc(g.id)+'"'+(g.id===groupId?' selected':'')+'>'+esc(g.name)+'</option>').join("");
    pane.innerHTML=header("Grupos, tópicos e modelos","Configure uma vez. Ao escolher o modelo de solicitação, o site já saberá para qual tópico enviar.")+
      '<div class="tg-guide-banner"><strong>Como funciona?</strong><p><b>1.</b> Escolha um destino · <b>2.</b> Selecione o grupo e o tópico reais · <b>3.</b> Marque todos os modelos que vão para esse tópico.</p><p>Exemplo: <b>Cadastro</b> e <b>Nomenclatura</b> no mesmo tópico, <b>Atualização de CB</b> em outro. No envio, o destino será automático.</p></div>'+
      routingSummary()+
      '<section class="tg-setup-section"><div class="tg-step-header"><span class="tg-step-number">1</span><div><h4>Escolha um destino</h4><p>É o conjunto grupo + tópico, que pode receber vários modelos.</p></div></div>'+
      '<div class="tg-config-select"><label>Destino que deseja configurar<select id="tgConfiguredDestination">'+(select||'<option value="">Nenhum destino criado</option>')+'</select></label><button type="button" class="btn btn-soft btn-small" id="tgCreateGroup">+ Novo destino</button></div>'+
      (selected?'<div class="tg-group-actions"><button type="button" class="btn btn-ghost btn-small" id="tgRenameGroup">Renomear destino</button><button type="button" class="btn btn-ghost btn-small" id="tgDeleteGroup">Excluir destino</button></div>':'')+'</section>'+
      '<section class="tg-setup-section"><div class="tg-step-header"><span class="tg-step-number">2</span><div><h4>Conecte ao grupo e ao tópico</h4><p>Escolha primeiro o grupo do Telegram e depois o tópico (se existir).</p></div></div>'+
      (selected?'<p class="tg-linked-description">'+(selected.telegramId?'Destino atual: '+esc(selected.telegramName||selected.name)+(selected.topicName?' / '+esc(selected.topicName):selected.isForum?' / tópico não selecionado':''):'Este destino ainda não foi vinculado a um grupo real.')+'</p><div id="tgRealGroupChooser"></div>':
        '<p class="tg-muted">Crie um destino na etapa 1 para começar.</p>')+'</section>'+
      '<section class="tg-setup-section"><div class="tg-step-header"><span class="tg-step-number">3</span><div><h4>Defina os modelos deste tópico</h4><p>Marque quantos tipos de solicitação desejar. Um modelo terá um único destino automático.</p></div></div>'+
      (selected?'<div class="tg-model-list">'+templates.categories.map(cat=>{
        return '<div class="tg-config-category"><div class="tg-config-category-title">'+esc(cat.name)+'</div>'+cat.ids.map(id=>{
          const m=modelMap.get(id),current=destination(id),checked=current?.id===selected.id;
          return '<label class="tg-model-assignment"><input type="checkbox" data-tg-map="'+esc(id)+'"'+(checked?" checked":"")+'><span><strong>'+esc(m.name)+'</strong><small>'+(checked?'Vai para este destino':current?'Atualmente: '+esc(current.name):'Sem destino definido')+'</small></span><em class="'+(checked?'tg-assigned-current':current?'tg-assigned-elsewhere':'')+'">'+(checked?'✓ Neste tópico':current?'Trocar destino':'Disponível')+'</em></label>';
        }).join("")+'</div>';
      }).join("")+'</div>':'<p class="tg-muted">Configure um destino para selecionar seus modelos.</p>')+'</section>'+
      '<section class="tg-final-step"><strong>Pronto! Agora é só solicitar.</strong><p>Em <b>Nova solicitação</b>, selecione o modelo, preencha os produtos e revise a prévia. O destino já aparecerá preenchido; você só confirma o envio.</p><button type="button" class="btn btn-primary btn-small" id="tgGoCompose">Ir para Nova solicitação</button></section>';
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
  const toggle=$("tgMenuToggle"),sideKey="controle-pdc-telegram-menu-collapsed-v1";
  if(localStorage.getItem(sideKey)==="1")page.classList.add("sidebar-collapsed");
  if(toggle)toggle.addEventListener("click",()=>{
    if(window.innerWidth<=760)side.classList.toggle("open");
    else{
      page.classList.toggle("sidebar-collapsed");
      localStorage.setItem(sideKey,page.classList.contains("sidebar-collapsed")?"1":"0");
    }
    updateMenuState();
  });
  $("tgMenuClose")?.addEventListener("click",()=>{
    if(window.innerWidth<=760)side.classList.remove("open");
    else{
      page.classList.add("sidebar-collapsed");
      localStorage.setItem(sideKey,"1");
    }
    updateMenuState();
  });
  window.addEventListener("resize",updateMenuState);
  pane.addEventListener("change",e=>{
    const el=e.target;
    if(el.id==="tgRealGroupSelect"){loadTopicChoices();return;}
    if(el.id==="tgConfiguredDestination"){
      if(state.groups.some(g=>g.id===el.value)){groupId=el.value;render();}
      return;
    }
    if(el.id==="tgModelCategory"){modelCategory=el.value;openModelCategory=el.value==="all"?model().category:el.value;renderModelChoices();return;}
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
    const el=e.target;
    if(el.id==="tgModelSearch"){modelSearch=el.value;renderModelChoices();return;}
    const d=draft();
    if(el.dataset.tgRow!==undefined){
      const i=Number(el.dataset.tgRow),key=el.dataset.tgKey;
      if(!Number.isInteger(i)||i<0||i>=d.rows.length||!["ci","cb","name","newCB","date","qty"].includes(key))return;
      d.rows[i][key]=el.value;
    }else if(el.dataset.tgField!==undefined){
      const key=el.dataset.tgField;
      if(!["ci","cb","name","rootCI","rootName","unit","qty","customUnit","eanMode","oldName","newName","cost","sale","memo","category"].includes(key))return;
      d[key]=el.value;
      if(["unit","eanMode"].includes(key)){store();renderCompose();return;}
    }else return;
    store();updatePreview();
  });
  pane.addEventListener("click",async e=>{
    const category=e.target.closest("[data-tg-cat]");
    if(category){openModelCategory=openModelCategory===category.dataset.tgCat?"":category.dataset.tgCat;renderModelChoices();return;}
    const selectedModel=e.target.closest("[data-tg-model]");
    if(selectedModel){
      modelId=selectedModel.dataset.tgModel;
      openModelCategory=model().category;
      renderCompose();return;
    }
    const part=e.target.closest("[data-tg-copy-part]");
    const product=e.target.closest("[data-tg-copy-row]");
    if(part||product){
      const index=Number((part?.dataset.tgWhich??product?.dataset.tgCopyRow??0));
      const d=draft(),r=models.find(x=>x.id===modelId)?.multi?d.rows[index]:(d||{});
      const text=product?templates.rowMessage(modelId,d,r||{}):String(r?.[part.dataset.tgCopyPart]||"");
      try{await navigator.clipboard.writeText(text);notice("Campo copiado.");}
      catch(_){notice("Não foi possível copiar. Verifique a permissão do navegador.",true);}
      return;
    }
    const overview=e.target.closest("[data-tg-destination]");
    if(overview){groupId=overview.dataset.tgDestination;render();return;}
    if(e.target.closest("#tgCreateGroup")){$("tgAddGroup").click();return;}
    if(e.target.closest("#tgGoCompose")){section="solicitacoes";render();return;}
    if(e.target.closest("#tgClearDraft")){
      if(confirm("Limpar os campos deste modelo?")){state.drafts[modelId]=templates.defaults(modelId);store();renderCompose();}
      return;
    }
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
      // Identificação amigável distingue subchats do mesmo grupo.
      g.name=actual.name+(selectedTopic?" / "+selectedTopic.name:"");
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
      const problem=templates.validate(modelId,draft());
      if(problem)return notice(problem,true);
      const dest=destination(modelId);
      const actual=window.TelegramConnector?.groups?.().find(x=>x.id===dest?.telegramId);
      if(!dest||!dest.telegramId||((actual?.isForum??dest.isForum)&&dest.topicId==null))return notice("Configure grupo e tópico deste modelo em Grupos e modelos.",true);
      if(!window.TelegramConnector?.connected?.())return notice("Conecte o Telegram em Configurações.",true);
      const txt=getMessage();
      if(!txt.trim())return notice("Preencha o texto da solicitação.",true);
      const destinationLabel=(dest.telegramName||dest.name)+(dest.topicName?" / "+dest.topicName:"");
      if(!confirm("Enviar esta solicitação para "+destinationLabel+"?\n\n"+txt))return;
      try{
        const result=await window.TelegramConnector.send(dest.telegramId,txt,dest.topicId??null);
        notice("Mensagem enviada para "+destinationLabel+" (ID "+result.id+"). Sincronize o monitor para acompanhar as reações.");
      }catch(err){notice("Falha no envio: "+String(err.message||err),true);}return;
    }
    if(e.target.closest("#tgCopyMessage")){
      const problem=templates.validate(modelId,draft());
      if(problem)return notice(problem,true);
      try{
        await navigator.clipboard.writeText(getMessage());
        const group=destination(modelId);
        notice("Mensagem copiada."+(group?" Destino configurado: "+group.name+".":" Nenhum destino configurado.")+" Nenhum envio realizado.");
      }catch(_){notice("Não foi possível copiar. Verifique a permissão do navegador.",true);}
    }
  });
  render();updateMenuState();
})();