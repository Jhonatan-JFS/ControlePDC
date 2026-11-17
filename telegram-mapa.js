/* Mapa de vínculos: visualização e edição dos destinos de envio.
   Não controla seleção do Monitoramento nem abre sessão Telegram. */
(() => {
  "use strict";
  let selectedModel = "", search = "", view = "map", observer = null;
  const esc = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const colors = ["#9b83ff","#54bbff","#68d8ae","#ffcb6b","#f68dbb","#83d7e6","#d5a5ff","#99b96c"];
  const label = g => (g.telegramName || g.name) + (g.topicName ? " / " + g.topicName : (g.isForum && g.topicId == null ? " / tópico pendente" : ""));
  const idsFor = (links, id) => Array.isArray(links[id]) ? links[id] : (links[id] ? [links[id]] : []);
  function render(mount, data) {
    if (observer) { observer.disconnect(); observer = null; }
    const models = data.models || [], groups = data.groups || [], links = data.links || {};
    const monitorGroups=Array.isArray(data.monitored)?data.monitored:[];
    const isMonitored=g=>{const item=monitorGroups.find(x=>x.id===g.telegramId);return !!item && (!g.isForum||item.topics?.some(t=>String(t.id)===String(g.topicId)));};
    if (!models.some(m => m.id === selectedModel)) selectedModel = models[0] ? models[0].id : "";
    const query = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const matches = text => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query);
    const visibleModels = models.filter(m => matches(m.name + " " + m.category));
    const visibleGroups = groups.filter(g => matches(label(g) + " " + g.name));
    const count = models.reduce((sum, m) => sum + idsFor(links,m.id).length, 0);
    const linkedModels = models.filter(m => idsFor(links,m.id).length).length;
    const current = models.find(m => m.id === selectedModel);
    const currentGroups = idsFor(links, selectedModel);
    const fmtGroup = g => esc(label(g));
    const ready = g => !!g.telegramId && (!g.isForum || g.topicId != null);
    const cards = visibleModels.map((m, i) => {
      const ids = idsFor(links,m.id);
      const active = m.id === selectedModel;
      return '<button type="button" class="link-node link-source'+(active ? ' is-selected' : '')+'" data-link-model="'+esc(m.id)+'" aria-pressed="'+String(active)+'" style="--node-color:'+colors[models.indexOf(m)%colors.length]+'">'+
        '<span class="link-node-mark">▤</span><span class="link-node-body"><strong>'+esc(m.name)+'</strong><small>'+esc(m.category)+' · '+ids.length+' destino(s)</small></span><span class="link-dot" aria-hidden="true"></span></button>';
    }).join("");
    const destinations = visibleGroups.map(g => {
      const linked = currentGroups.includes(g.id);
      return '<div class="link-destination-row"><button type="button" class="link-node link-destination'+(linked ? ' is-linked' : '')+'" data-link-destination="'+esc(g.id)+'" aria-pressed="'+String(linked)+'" aria-label="'+(linked ? 'Desvincular ' : 'Vincular ')+fmtGroup(g)+' do modelo '+esc(current?.name||'')+'">'+
        '<span class="link-dot" aria-hidden="true"></span><span class="link-node-mark">'+(linked ? '✓' : '♧')+'</span><span class="link-node-body"><strong>'+esc(g.name)+'</strong><small>'+fmtGroup(g)+'</small><small class="link-monitor-label '+(isMonitored(g)?'monitored':'')+'">'+(isMonitored(g)?'◉ Monitorado':'Monitoramento independente')+'</small></span><span class="link-dest-state '+(ready(g)?'ready':'pending')+'">'+(ready(g)?(linked?'Vinculado':'Disponível'):'Pendente')+'</span></button>'+
        '<button type="button" class="link-edit-destination" data-link-edit="'+esc(g.id)+'" title="Configurar grupo e tópico" aria-label="Configurar '+esc(g.name)+'">⚙</button></div>';
    }).join("");
    const summary = visibleModels.map(m => {
      const attached = idsFor(links,m.id).map(id=>groups.find(g=>g.id===id)).filter(Boolean);
      return '<div class="link-list-row"><div><strong>'+esc(m.name)+'</strong><small>'+esc(m.category)+'</small></div><div class="link-list-tags">'+
        (attached.length ? attached.map(g=>'<button type="button" data-link-remove="'+esc(m.id)+'" data-link-target="'+esc(g.id)+'" title="Remover este vínculo">'+fmtGroup(g)+' <span aria-hidden="true">×</span></button>').join("") : '<span class="link-none">Sem destino</span>')+
        '</div></div>';
    }).join("");
    mount.innerHTML =
      '<div class="link-map" id="tgLinkMapRoot">'+
      '<div class="tg-workspace-head"><div><h3>Mapa de Vínculos</h3><p>Escolha uma mensagem à esquerda e toque nos grupos ou tópicos à direita para ligar ou desligar o envio. Um modelo pode ter vários destinos.</p></div></div>'+
      '<div class="link-map-toolbar"><div class="link-map-counts"><span><b>'+linkedModels+'</b> modelos com destino</span><span><b>'+count+'</b> vínculos</span><span><b>'+groups.length+'</b> destinos cadastrados</span></div>'+
      '<div class="link-map-actions"><label class="link-map-search">⌕ <input id="tgLinkSearch" type="search" placeholder="Buscar mensagem, grupo ou tópico..." value="'+esc(search)+'" aria-label="Buscar no mapa de vínculos"></label>'+
      '<button type="button" class="btn btn-soft btn-small" data-link-view="map" aria-pressed="'+String(view==='map')+'">Mapa</button>'+
      '<button type="button" class="btn btn-soft btn-small" data-link-view="list" aria-pressed="'+String(view==='list')+'">Lista</button></div></div>'+
      '<div class="link-map-explanation"><span class="link-map-pulse">●</span><div><strong>'+(current?esc(current.name):'Selecione uma mensagem')+'</strong><small>'+currentGroups.length+' destino(s) selecionado(s) para envio. Clique em um grupo para '+(currentGroups.length?'adicionar ou retirar':'criar')+' vínculo.</small></div>'+
      '<button type="button" id="tgLinkClear" class="btn btn-ghost btn-small"'+(!currentGroups.length?' disabled':'')+'>Desvincular todos</button></div>'+
      (view==='map'?
        '<div class="link-map-canvas" id="tgLinkCanvas"><svg class="link-map-lines" id="tgLinkLines" aria-hidden="true" preserveAspectRatio="none"></svg>'+
        '<section class="link-map-column link-map-sources" aria-label="Modelos de mensagens"><div class="link-map-column-head"><strong>Mensagens / modelos</strong><small>'+visibleModels.length+' resultado(s)</small></div><div class="link-map-nodes">'+(cards||'<p class="link-map-empty">Nenhum modelo encontrado.</p>')+'</div></section>'+
        '<section class="link-map-column link-map-destinations" aria-label="Grupos e tópicos de destino"><div class="link-map-column-head"><strong>Grupos e tópicos (Telegram)</strong><button type="button" class="link-map-plus" data-link-add title="Adicionar destino">+ Novo</button></div>'+
        '<div class="link-map-nodes">'+(destinations||'<p class="link-map-empty">Nenhum destino cadastrado ou encontrado. Adicione um grupo e escolha o tópico.</p>')+'</div></section></div>':
        '<div class="link-list" aria-label="Lista de vínculos">'+(summary||'<p class="link-map-empty">Nenhuma mensagem encontrada.</p>')+'</div>')+
      '<div class="link-map-footer"><p>Os vínculos são usados <strong>somente no envio</strong>. Grupos monitorados e reações são configurados separadamente, sem serem alterados aqui.</p>'+
      '<div><button type="button" class="btn btn-soft btn-small" data-link-manage>Gerenciar grupos e tópicos</button> <button type="button" class="btn btn-soft btn-small" data-link-monitor>Ir ao monitoramento</button> <button type="button" class="btn btn-primary btn-small" data-link-compose>Nova solicitação</button></div></div>'+
      '</div>';
    const root = mount.querySelector("#tgLinkMapRoot");
    const draw = () => {
      const canvas = root.querySelector("#tgLinkCanvas"), svg = root.querySelector("#tgLinkLines");
      if (!canvas || !svg) return;
      const bounds=canvas.getBoundingClientRect();
      svg.setAttribute("viewBox","0 0 "+Math.max(1,bounds.width)+" "+Math.max(1,bounds.height));
      svg.replaceChildren();
      // O modo compacto usa indicadores nas linhas de texto, sem fios cruzados.
      if (window.matchMedia("(max-width: 850px)").matches) return;
      for (const m of visibleModels) {
        const a=root.querySelector('[data-link-model="'+CSS.escape(m.id)+'"]');
        if (!a) continue;
        const ar=a.querySelector(".link-dot").getBoundingClientRect();
        const x1=ar.left + ar.width/2-bounds.left, y1=ar.top+ar.height/2-bounds.top;
        for (const id of idsFor(links,m.id)) {
          const b=root.querySelector('[data-link-destination="'+CSS.escape(id)+'"] .link-dot');
          if (!b) continue;
          const br=b.getBoundingClientRect(),x2=br.left+br.width/2-bounds.left,y2=br.top+br.height/2-bounds.top;
          const mid=Math.max(25,(x2-x1)*.48);
          const path=document.createElementNS("http://www.w3.org/2000/svg","path");
          path.setAttribute("d","M"+x1+" "+y1+" C"+(x1+mid)+" "+y1+" "+(x2-mid)+" "+y2+" "+x2+" "+y2);
          path.setAttribute("stroke",colors[models.indexOf(m)%colors.length]);
          path.setAttribute("stroke-width",m.id===selectedModel?"3.5":"2");
          path.setAttribute("opacity",m.id===selectedModel?"1":".22");
          path.setAttribute("fill","none");
          svg.appendChild(path);
        }
      }
    };
    requestAnimationFrame(draw);
    if (typeof ResizeObserver !== "undefined" && view==='map') {
      observer=new ResizeObserver(draw);
      observer.observe(root.querySelector("#tgLinkCanvas"));
    }
    root.addEventListener("click", e => {
      const target=e.target.closest("button");
      if(!target)return;
      if(target.dataset.linkModel){selectedModel=target.dataset.linkModel;render(mount,data);return;}
      if(target.dataset.linkDestination){if(selectedModel)data.onToggle(selectedModel,target.dataset.linkDestination);return;}
      if(target.dataset.linkRemove){data.onToggle(target.dataset.linkRemove,target.dataset.linkTarget);return;}
      if(target.dataset.linkEdit){data.onEdit(target.dataset.linkEdit);return;}
      if(target.dataset.linkView){view=target.dataset.linkView;render(mount,data);return;}
      if(target.hasAttribute("data-link-add")){data.onAdd();return;}
      if(target.hasAttribute("data-link-manage")){data.onManage();return;}
      if(target.hasAttribute("data-link-compose")){data.onCompose(selectedModel);return;}
      if(target.hasAttribute("data-link-monitor")){data.onMonitor();return;}
      if(target.id==="tgLinkClear"){
        if(currentGroups.length && confirm("Remover todos os "+currentGroups.length+" vínculos de "+current.name+"?")){
          data.onClear(selectedModel);
        }
      }
    });
    root.querySelector("#tgLinkSearch")?.addEventListener("input",e=>{
      const cursor=e.target.selectionStart;search=e.target.value;render(mount,data);
      const field=mount.querySelector("#tgLinkSearch");if(field){field.focus();field.setSelectionRange(cursor,cursor);}
    });
  }
  window.TelegramLinkMap={render};
})();