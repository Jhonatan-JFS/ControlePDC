
/* Organização local de destinos por grupo. Não realiza envios nem acessa Telegram. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const root = $("tgGroupList");
  const form = $("reqForm");
  const models = $("reqCategories");
  if (!root || !form || !models) return;
  const STORAGE = "controle-pdc-telegram-destinos-v1";
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  function readState(){
    try {
      const stored=JSON.parse(localStorage.getItem(STORAGE)||"{}");
      return {
        groups:Array.isArray(stored.groups)?stored.groups.filter(x=>x&&typeof x.id==="string"&&typeof x.name==="string").slice(0,40):[],
        mappings:stored.mappings && typeof stored.mappings==="object" && !Array.isArray(stored.mappings)?stored.mappings:{}
      };
    } catch(_) { return {groups:[],mappings:{}}; }
  }
  const state=readState();
  let filter="all", currentModel="cadastro";
  function persist(){
    try{localStorage.setItem(STORAGE,JSON.stringify(state));}
    catch(_){alert("Não foi possível salvar os grupos neste navegador.");}
  }
  function identifier(){
    return (typeof crypto!=="undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())+"-"+Math.random().toString(36).slice(2);
  }
  function current(){
    const active=models.querySelector("[data-model].active");
    if(active)currentModel=active.dataset.model;
    return currentModel;
  }
  function renderNavigation(){
    const count=id=>Object.values(state.mappings).filter(x=>x===id).length;
    root.innerHTML='<button type="button" class="tg-group-button '+(filter==="all"?"active":"")+'" data-tg-filter="all">Todos os modelos</button>'+
      state.groups.map(g=>'<div class="tg-group-row"><button type="button" class="tg-group-button '+(filter===g.id?"active":"")+'" data-tg-filter="'+escapeHtml(g.id)+'">'+escapeHtml(g.name)+' <small>'+count(g.id)+'</small></button><button type="button" class="tg-remove-group" data-tg-remove="'+escapeHtml(g.id)+'" title="Remover grupo" aria-label="Remover '+escapeHtml(g.name)+'">×</button></div>').join("");
  }
  function renderPicker(){
    let block=form.querySelector(".tg-dest-picker");
    if(!block){
      const heading=form.querySelector(".req-form-heading");
      if(!heading)return;
      block=document.createElement("div");
      block.className="tg-dest-picker";
      block.innerHTML='<label for="tgDestination">Grupo de destino para este modelo</label><select id="tgDestination"></select><small>Este vínculo organiza os modelos neste navegador; o envio real ao Telegram será habilitado somente após a integração segura.</small>';
      heading.insertAdjacentElement("afterend",block);
      block.querySelector("select").addEventListener("change",event=>{
        const group=event.target.value;
        if(group && !state.groups.some(g=>g.id===group))return;
        const key=current();
        if(group)state.mappings[key]=group;
        else delete state.mappings[key];
        persist();renderNavigation();applyFilter();
      });
    }
    const selected=state.mappings[current()]||"";
    block.querySelector("select").innerHTML='<option value="">Sem grupo configurado</option>'+state.groups.map(g=>'<option value="'+escapeHtml(g.id)+'"'+(selected===g.id?' selected':'')+'>'+escapeHtml(g.name)+'</option>').join("");
  }
  function applyFilter(){
    const choices=Array.from(models.querySelectorAll("[data-model]"));
    choices.forEach(button=>{
      button.hidden=filter!=="all" && state.mappings[button.dataset.model]!==filter;
    });
    models.querySelectorAll(".req-model-group").forEach(section=>{
      const visible=Array.from(section.querySelectorAll("[data-model]")).some(button=>!button.hidden);
      // As categorias recolhidas não possuem botões no DOM. Mantê-las disponíveis para expansão.
      section.hidden=filter!=="all" && section.querySelectorAll("[data-model]").length>0 && !visible;
    });
  }
  $("tgAddGroup").addEventListener("click",()=>{
    const response=prompt("Nome do grupo (a associação real ao Telegram será configurada depois):","");
    if(response===null)return;
    const name=response.trim();
    if(!name || name.length>80)return alert("Informe um nome com até 80 caracteres.");
    if(state.groups.some(g=>g.name.toLowerCase()===name.toLowerCase()))return alert("Já existe um grupo com esse nome.");
    if(state.groups.length>=40)return alert("Limite de 40 grupos locais.");
    const group={id:identifier(),name};
    state.groups.push(group);
    state.mappings[current()]=group.id;
    filter=group.id;persist();renderNavigation();renderPicker();applyFilter();
  });
  root.addEventListener("click",event=>{
    const remove=event.target.closest("[data-tg-remove]");
    if(remove){
      const entry=state.groups.find(g=>g.id===remove.dataset.tgRemove);
      if(!entry || !confirm("Remover o grupo "+entry.name+"? Nenhuma solicitação será excluída."))return;
      state.groups.splice(state.groups.indexOf(entry),1);
      for(const model of Object.keys(state.mappings))if(state.mappings[model]===entry.id)delete state.mappings[model];
      if(filter===entry.id)filter="all";
      persist();renderNavigation();renderPicker();applyFilter();return;
    }
    const target=event.target.closest("[data-tg-filter]");
    if(target){filter=target.dataset.tgFilter;renderNavigation();applyFilter();}
  });
  models.addEventListener("click",event=>{
    const choice=event.target.closest("[data-model]");
    if(choice)currentModel=choice.dataset.model;
  });
  const formObserver=new MutationObserver(()=>renderPicker());
  formObserver.observe(form,{childList:true});
  const modelObserver=new MutationObserver(()=>applyFilter());
  modelObserver.observe(models,{childList:true});
  renderNavigation();renderPicker();applyFilter();
})();
