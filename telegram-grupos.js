/* Central Telegram independente. Nesta fase: configuração de grupos e rascunhos locais.
   Não envia ao Telegram, não lê chats e não modifica o Controle PDC. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const page=$("telegramPage"), workspace=$("tgWorkspace"), list=$("tgGroupList"), sidebar=document.querySelector(".tg-sidebar");
  if(!page || !workspace || !list || !sidebar)return;
  const STORAGE="controle-pdc-telegram-destinos-v1";
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const val=s=>String(s??"").trim();
  function read(){
    try{
      const s=JSON.parse(localStorage.getItem(STORAGE)||"{}");
      const source=Array.isArray(s.groups)?s.groups:[];
      const groups=source.filter(g=>g&&typeof g.name==="string"&&typeof g.id==="string").slice(0,40).map(g=>{
        const guessed=(s.mappings&&s.mappings.cb===g.id)?"cb":"cb";
        return {id:g.id,name:g.name.slice(0,80),model:g.model==="custom"?"custom":guessed};
      });
      return {groups,drafts:s.drafts&&typeof s.drafts==="object"&&!Array.isArray(s.drafts)?s.drafts:{},mappings:s.mappings||{}};
    }catch(_){return {groups:[],drafts:{},mappings:{}};}
  }
  const state=read();
  let groupId=state.groups[0]?.id||"", section="solicitacoes";
  function store(){
    try{localStorage.setItem(STORAGE,JSON.stringify(state));return true;}
    catch(_){notify("Não foi possível salvar no navegador.",true);return false;}
  }
  function notify(message,error=false){
    const el=$("tgNotice");
    if(el){el.textContent=message;el.classList.toggle("error",error);}
  }
  function uid(){return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2);}
  function active(){return state.groups.find(g=>g.id===groupId);}
  function draft(){
    if(!groupId)return {rows:[{}],customTitle:"",customText:""};
    let item=state.drafts[groupId];
    if(!item||!Array.isArray(item.rows)){item={rows:[{}],customTitle:"",customText:""};state.drafts[groupId]=item;}
    if(!item.rows.length)item.rows=[{}];
    return item;
  }
  function menu(){
    document.querySelectorAll("[data-tg-section]").forEach(b=>{
      const selected=b.dataset.tgSection===section;
      b.classList.toggle("active",selected);
      b.setAttribute("aria-current",selected?"page":"false");
    });
    list.innerHTML=state.groups.map(g=>'<button type="button" class="tg-group-button '+(g.id===groupId&&section==="solicitacoes"?"active":"")+'" data-tg-group="'+esc(g.id)+'"><span>'+esc(g.name)+'</span><small>'+(g.model==="custom"?"Personalizado":"Atualização de CB")+'</small></button>').join("") || '<p class="tg-empty-groups">Nenhum grupo configurado.</p>';
  }
  function header(title,sub){
    return '<div class="tg-workspace-head"><div><h3>'+esc(title)+'</h3><p>'+esc(sub)+'</p></div></div>';
  }
  function renderRows(){
    const rows=draft().rows;
    return rows.map((r,i)=>'<div class="tg-product" data-tg-item="'+i+'"><div class="tg-product-head"><strong>Item '+(i+1)+'</strong>'+(rows.length>1?'<button type="button" class="tg-text-button" data-tg-remove-row="'+i+'">Remover</button>':'')+'</div><div class="tg-fields"><label>CI<input data-tg-row="'+i+'" data-tg-key="ci" autocomplete="off" inputmode="numeric" value="'+esc(r.ci||"")+'" placeholder="Código interno"></label><label>Nome original do produto<input data-tg-row="'+i+'" data-tg-key="name" autocomplete="off" value="'+esc(r.name||"")+'" placeholder="Descrição como será enviada"></label><label>CB<input data-tg-row="'+i+'" data-tg-key="cb" autocomplete="off" inputmode="numeric" value="'+esc(r.cb||"")+'" placeholder="Código de barras"></label></div></div>').join("");
  }
  function content(){
    if(section==="monitoramento"){
      workspace.innerHTML=header("Monitoramento","Acompanhamento de mensagens, atualizações e reações.")+
        '<div class="tg-information"><strong>Integração pendente</strong><p>A captura de mensagens, a sincronização sob demanda e a conferência por qualquer reação serão ativadas quando o serviço seguro de conexão ao Telegram estiver configurado. Nenhuma mensagem está sendo monitorada nesta versão.</p></div>';
      return;
    }
    if(section==="configuracoes"){
      workspace.innerHTML=header("Configurações","Destinos e segurança da futura integração.")+
        '<div class="tg-information"><strong>Grupos cadastrados: '+state.groups.length+'</strong><p>Os nomes são definidos manualmente e ficam salvos apenas neste navegador. Ainda não existe vínculo com IDs de grupos reais do Telegram, envio automático ou sincronização entre dispositivos.</p><p>Quando a conexão segura estiver pronta, cada destino será selecionado entre os grupos autorizados da sua conta.</p></div>';
      return;
    }
    const g=active();
    if(!g){
      workspace.innerHTML=header("Solicitações","Selecione um grupo na lateral para preparar uma mensagem.")+
        '<div class="tg-information"><strong>Comece configurando um grupo.</strong><p>Use o botão + Grupo na sidebar para criar seu primeiro destino. Isso não envia nada ao Telegram.</p></div>';
      return;
    }
    const d=draft();
    const options='<option value="cb"'+(g.model==="cb"?" selected":"")+'>Atualização de Código de Barras</option><option value="custom"'+(g.model==="custom"?" selected":"")+'>Modelo personalizado (texto livre)</option>';
    const body=g.model==="custom" ?
      '<div class="tg-custom"><label>Título da solicitação<input data-tg-custom="customTitle" value="'+esc(d.customTitle||"")+'" placeholder="Ex.: Produtos novos"></label><label>Mensagem<textarea data-tg-custom="customText" rows="8" placeholder="Escreva o conteúdo conforme as regras que definir.">'+esc(d.customText||"")+'</textarea></label></div>' :
      '<div id="tgRows" class="tg-rows">'+renderRows()+'</div><button type="button" id="tgAddRow" class="btn btn-soft btn-small">+ Adicionar item</button>';
    workspace.innerHTML=header(g.name,"Solicitações destinadas a este grupo quando a integração real estiver disponível.")+
      '<div class="tg-editor-toolbar"><label>Modelo deste grupo<select id="tgModelSelect">'+options+'</select></label><div class="tg-group-actions"><button type="button" id="tgRenameGroup" class="btn btn-ghost btn-small">Renomear grupo</button><button type="button" id="tgDeleteGroup" class="btn btn-ghost btn-small">Excluir grupo</button></div></div>'+
      '<div class="tg-information tg-info-inline"><strong>Rascunho local — sem envio</strong><p>A mensagem abaixo pode ser copiada. Não será enviada ao Telegram por este site nesta etapa.</p></div>'+
      body+
      '<div class="tg-preview-panel"><div class="tg-preview-head"><strong>Prévia da mensagem</strong><span>Espaçamento preservado</span></div><pre id="tgPreview"></pre></div>'+
      '<div class="tg-editor-actions"><button type="button" id="tgSaveDraft" class="btn btn-soft">Salvar rascunho</button><button type="button" id="tgCopyMessage" class="btn btn-primary">Copiar mensagem</button></div>'+
      '<p id="tgNotice" class="tg-notice" role="status" aria-live="polite"></p>';
    updatePreview();
  }
  function message(){
    const g=active(), d=draft();
    if(!g)return "";
    if(g.model==="custom"){
      return [val(d.customTitle),val(d.customText)].filter(Boolean).join("\n\n");
    }
    const items=d.rows.map(r=>{
      const ci=val(r.ci), name=val(r.name), cb=val(r.cb);
      const first=ci && name ? ci+" - "+name : ci||name;
      return first ? first+(cb?"\nCB: "+cb:"") : (cb?"CB: "+cb:"");
    }).filter(Boolean);
    return "Atualização de Código de Barras"+(items.length?"\n\n"+items.join("\n\n"):"");
  }
  function updatePreview(){
    const target=$("tgPreview");
    if(target)target.textContent=message();
  }
  function render(){
    menu();content();
  }
  function closeMobileMenu(){
    if(sidebar.classList.contains("open")){
      sidebar.classList.remove("open");
      const b=$("tgMenuToggle");if(b)b.setAttribute("aria-expanded","false");
    }
  }
  $("tgAddGroup").addEventListener("click",()=>{
    const raw=prompt("Nome do grupo de destino:","");
    if(raw===null)return;
    const name=val(raw);
    if(!name||name.length>80)return alert("Informe um nome com até 80 caracteres.");
    if(state.groups.some(g=>g.name.toLowerCase()===name.toLowerCase()))return alert("Já existe um grupo com esse nome.");
    if(state.groups.length>=40)return alert("Limite de 40 grupos nesta versão.");
    const g={id:uid(),name,model:"cb"};
    state.groups.push(g);groupId=g.id;section="solicitacoes";
    draft();store();render();closeMobileMenu();
  });
  list.addEventListener("click",e=>{
    const btn=e.target.closest("[data-tg-group]");
    if(!btn)return;
    groupId=btn.dataset.tgGroup;section="solicitacoes";render();closeMobileMenu();
  });
  sidebar.addEventListener("click",e=>{
    const b=e.target.closest("[data-tg-section]");
    if(!b)return;
    section=b.dataset.tgSection;render();closeMobileMenu();
  });
  const toggle=$("tgMenuToggle");
  if(toggle)toggle.addEventListener("click",()=>{
    const open=sidebar.classList.toggle("open");
    toggle.setAttribute("aria-expanded",String(open));
  });
  workspace.addEventListener("change",e=>{
    if(e.target.id!=="tgModelSelect")return;
    const g=active();
    if(!g || !["cb","custom"].includes(e.target.value))return;
    g.model=e.target.value;store();render();
  });
  workspace.addEventListener("input",e=>{
    const el=e.target, d=draft();
    if(el.dataset.tgRow!==undefined){
      const idx=Number(el.dataset.tgRow), key=el.dataset.tgKey;
      if(!Number.isInteger(idx)||idx<0||idx>=d.rows.length||!["ci","name","cb"].includes(key))return;
      d.rows[idx][key]=el.value;
    }else if(["customTitle","customText"].includes(el.dataset.tgCustom)){
      d[el.dataset.tgCustom]=el.value;
    }else return;
    store();updatePreview();
  });
  workspace.addEventListener("click",async e=>{
    const remove=e.target.closest("[data-tg-remove-row]");
    if(remove){
      const index=Number(remove.dataset.tgRemoveRow);
      if(draft().rows.length>1 && index>=0 && index<draft().rows.length){
        draft().rows.splice(index,1);store();content();
      }
      return;
    }
    if(e.target.closest("#tgAddRow")){draft().rows.push({});store();content();return;}
    if(e.target.closest("#tgSaveDraft")){store();notify("Rascunho salvo neste navegador.");return;}
    if(e.target.closest("#tgRenameGroup")){
      const g=active(), raw=prompt("Novo nome do grupo:",g.name);
      if(raw===null)return;
      const name=val(raw);
      if(!name||name.length>80)return alert("Nome inválido.");
      if(state.groups.some(other=>other.id!==g.id&&other.name.toLowerCase()===name.toLowerCase()))return alert("Este nome já está em uso.");
      g.name=name;store();render();return;
    }
    if(e.target.closest("#tgDeleteGroup")){
      const g=active();
      if(!g||!confirm("Excluir o grupo "+g.name+" e seu rascunho local? Nenhum registro do Controle PDC será alterado."))return;
      state.groups=state.groups.filter(x=>x.id!==g.id);
      delete state.drafts[g.id];
      for(const key of Object.keys(state.mappings))if(state.mappings[key]===g.id)delete state.mappings[key];
      groupId=state.groups[0]?.id||"";store();render();return;
    }
    if(e.target.closest("#tgCopyMessage")){
      const g=active(), d=draft();
      if(g.model==="cb"){
        const provided=d.rows.filter(r=>val(r.ci)||val(r.name)||val(r.cb));
        if(!provided.length||provided.some(r=>!val(r.ci)||!val(r.cb)))return notify("Informe CI e CB em cada item antes de copiar.",true);
      } else if(!val(d.customText))return notify("Escreva a mensagem antes de copiar.",true);
      try{
        await navigator.clipboard.writeText(message());
        notify("Mensagem copiada. Nenhum envio foi realizado.");
      }catch(_){notify("Não foi possível copiar. Verifique a permissão do navegador.",true);}
    }
  });
  render();
})();