/* Solicitações: complementa o Controle PDC sem substituir seu fluxo de carga. */
(() => {
  "use strict";
  const core = window.ControlPDC;
  if (!core) return;
  const $ = id => document.getElementById(id);
  const cats = [
    {name:"Cadastros", ids:["cadastro","grade"]},
    {name:"Códigos e Identificação", ids:["cb","ean"]},
    {name:"Preços e Custos", ids:["preco","verificarPreco","custo"]},
    {name:"Grades e Unidades", ids:["desmembrar"]},
    {name:"Promoções e Validades", ids:["promoEntrar","promoSair","validadeAdd","validadeRemove"]},
    {name:"Dados do Produto", ids:["nome"]}
  ];
  const models = {
    cadastro:{name:"Cadastro de Produto", cat:"new", multi:true},
    cadastroNFe:{name:"Cadastro com NF-e",cat:"new",multi:true},
    grade:{name:"Cadastro em Grade",cat:"new",multi:true},
    cb:{name:"Atualização de CB",cat:"other",multi:true},
    ean:{name:"Adicionar CI ou CB no EAN",cat:"other"},
    preco:{name:"Ajuste de Preço",cat:"other"},
    verificarPreco:{name:"Verificação de Preço",cat:"other"},
    custo:{name:"Adicionar Valor de Custo",cat:"other"},
    desmembrar:{name:"Desmembramento em Grade",cat:"other",multi:true},
    promoEntrar:{name:"Entrada de Promoção",cat:"promo",multi:true},
    promoSair:{name:"Retirada de Promoção",cat:"promo",multi:true},
    validadeAdd:{name:"Adição de Validade",cat:"promo",multi:true},
    validadeRemove:{name:"Remoção de Validade",cat:"promo",multi:true},
    nome:{name:"Alteração de Nomenclatura",cat:"other"}
  };
  const pdcNames = {increase:"Aumento",decrease:"Redução",new:"Novo",promo:"Promoção",other:"Outros"};
  const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[ch]);
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  let selected=new Set(),expanded=new Set();
  const historyOpenTypes=new Set(),historyOpenItems=new Set();
  async function copy(str){try{await navigator.clipboard.writeText(str);core.notify('Copiado.');return true;}catch(_){core.notify('Não foi possível copiar. Verifique a permissão do navegador.',true);return false;}}
  function allRequests(){return core.read().requests||[];}
  function filteredRequests(){
    const txt=norm($('supSearch').value),cat=$('supCategory').value,type=$('supModel').value,status=$('supStatus').value;
    return allRequests().filter(r=>{
      if(status==='open'&&!['awaiting','not_done'].includes(r.status))return false;
      if(status!=='open'&&status!=='all'&&r.status!==status)return false;
      if(cat!=='all'&&r.pdcCategory!==cat)return false;
      if(type!=='all'&&r.modelId!==type)return false;
      return !txt||norm([r.ci,r.cb,r.name,r.modelName,r.message,r.reason].join(' ')).includes(txt);
    }).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  }
  function renderSupervision(){
    if(!$('supervisionCount'))return;
    const all=allRequests(), pending=all.filter(x=>['awaiting','not_done'].includes(x.status));
    $('supervisionCount').textContent=String(pending.length);
    $('supervisionToggle').setAttribute('aria-expanded',String(!$('supervisionBody').classList.contains('hidden')));
    $('reqHistoryCount').textContent=all.length+' registros';
    $('copySupervisionReport').disabled=!filteredRequests().length;
    if($('supervisionBody').classList.contains('hidden')){renderHistory();return;}
    const list=filteredRequests(), allowed=new Set(list.filter(x=>['awaiting','not_done'].includes(x.status)).map(x=>x.id));
    const available=list.filter(x=>allowed.has(x.id));const chosen=available.filter(x=>selected.has(x.id));
    $('supSelected').textContent=chosen.length+' selecionado(s)';
    $('supSelectAll').checked=!!available.length&&chosen.length===available.length;
    $('supSelectAll').indeterminate=chosen.length>0&&chosen.length<available.length;
    $('supApprove').disabled=!chosen.length;
    $('supReject').disabled=!chosen.length;
    $('supItems').innerHTML=list.length?list.map(r=>{
      const waiting=['awaiting','not_done'].includes(r.status),open=expanded.has(r.id);
      const source=r.status==='approved'?'<span class="req-ok">Confirmada</span>':r.status==='not_done'?'<span class="req-alert">Não realizada</span>':'<span class="req-wait">Aguardando</span>';
      return `<article class="sup-item ${r.status}"><div class="sup-main">${waiting?`<input type="checkbox" data-select-request="${escapeHtml(r.id)}" ${selected.has(r.id)?'checked':''} aria-label="Selecionar solicitação">`:'<span class="sup-check-placeholder"></span>'}<div class="sup-item-text"><strong>${escapeHtml(r.ci||'Sem CI')} <span>${escapeHtml(r.name)}</span></strong><small>${escapeHtml(r.modelName)} · ${escapeHtml(pdcNames[r.pdcCategory]||'Outros')} · ${new Date(r.createdAt).toLocaleDateString('pt-BR')}</small></div>${source}<button type="button" data-expand-request="${escapeHtml(r.id)}" class="btn btn-ghost btn-small" aria-expanded="${open}">${open?'Ocultar':'Detalhes'}</button></div>${open?`<div class="sup-detail"><pre>${escapeHtml(r.message)}</pre><p>CB: ${escapeHtml(r.cb||'—')} · Custo: ${escapeHtml(r.cost||'—')} · Venda: ${escapeHtml(r.sale||'—')}</p>${r.reason?`<p>Motivo: ${escapeHtml(r.reason)}</p>`:''}${waiting?`<div class="sup-detail-actions"><button type="button" class="btn btn-soft btn-small" data-edit-request="${escapeHtml(r.id)}">Corrigir dados</button>${r.status==='not_done'?`<button type="button" class="btn btn-soft btn-small" data-retry-request="${escapeHtml(r.id)}">Reenviar à supervisão</button>`:''}</div>`:''}</div>`:''}</article>`;
    }).join(''):'<p class="req-muted req-empty">Nenhuma solicitação encontrada neste filtro.</p>';
    renderHistory();
  }
  function renderHistory(){
    const root=$('reqHistory');if(!root)return;
    if(root.classList.contains('hidden'))return;
    const state=core.read(),items=state.items||[],events=state.events||[];
    const groups=new Map(),itemsByRequest=new Map(),eventsByItem=new Map();
    items.forEach(item=>{if(item.sourceRequestId)itemsByRequest.set(item.sourceRequestId,item);});
    events.forEach(event=>{if(!eventsByItem.has(event.itemId))eventsByItem.set(event.itemId,[]);eventsByItem.get(event.itemId).push(event);});
    const requests=(state.requests||[]).slice().sort((a,b)=>Date.parse(b.createdAt||0)-Date.parse(a.createdAt||0));
    for(const r of requests){
      const type=r.modelId||'modelo-antigo:'+String(r.modelName||'Outros');
      if(!groups.has(type))groups.set(type,{name:models[type]?.name||r.modelName||'Outros modelos',records:[]});
      groups.get(type).records.push(r);
    }
    root.innerHTML=[...groups].map(([type,group])=>{
      const groupOpen=historyOpenTypes.has(type);
      return `<section class="req-history-group">
        <button type="button" class="req-history-group-toggle" data-history-group="${escapeHtml(type)}" aria-expanded="${groupOpen}">
          <span><strong>${escapeHtml(group.name)}</strong><small>${group.records.length} item(ns)</small></span><span aria-hidden="true">${groupOpen?'⌃':'⌄'}</span>
        </button>
        ${groupOpen?`<div class="req-history-group-content">${group.records.map(r=>{
          const itemOpen=historyOpenItems.has(r.id),message=r.message||r.originalLine||'';
          const item=itemsByRequest.get(r.id),st=item?.stage;
          const itemEvents=eventsByItem.get(item?.id)||[];
          const lastEvent=target=>itemEvents.filter(e=>e.type==='stage'&&e.to===target).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
          const sent=lastEvent('sent'),printed=lastEvent('printed');
          return `<article class="req-history-item">
            <div class="req-history-row">
              <button type="button" class="req-history-item-toggle" data-history-item="${escapeHtml(r.id)}" aria-expanded="${itemOpen}" title="${itemOpen?'Recolher':'Exibir'} mensagem e andamento">
                <strong>${escapeHtml(r.ci||'Sem CI')} · ${escapeHtml(r.name||r.modelName||'Produto')}</strong>
                <small>${new Date(r.createdAt).toLocaleString('pt-BR')} · ${r.status==='approved'?'Realizada':r.status==='not_done'?'Não realizada':'Aguardando supervisão'}</small>
              </button>
              <button type="button" class="req-history-copy" data-history-copy="${escapeHtml(r.id)}" title="Copiar mensagem deste item" aria-label="Copiar mensagem do item ${escapeHtml(r.ci||r.cb||r.name||'registrado')}" ${message?'':'disabled'}>⧉</button>
              <button type="button" class="req-history-expand-icon" data-history-item="${escapeHtml(r.id)}" aria-label="${itemOpen?'Recolher':'Expandir'} item" aria-expanded="${itemOpen}">${itemOpen?'⌃':'⌄'}</button>
            </div>
            ${itemOpen?`<div class="req-history-detail"><span class="req-history-detail-label">Mensagem registrada</span><pre>${escapeHtml(message||'Mensagem não disponível neste registro.')}</pre>
              <small>Tipo: ${escapeHtml(r.modelName||group.name)} · Categoria PDC: ${escapeHtml(pdcNames[r.pdcCategory]||'Outros')}</small>
              <small>Supervisão: ${r.status==='approved'?'Confirmada':r.status==='not_done'?'Não realizada':'Aguardando'}${r.reviewedAt?' · '+new Date(r.reviewedAt).toLocaleString('pt-BR'):''}</small>
              ${r.reason?`<small>Motivo: ${escapeHtml(r.reason)}</small>`:''}
              ${item?`<small>Fila PDC: ${st==='printed'?'Impressão confirmada':st==='sent'?'Carga enviada':'Pendente de Carga'} · ${new Date(item.createdAt).toLocaleString('pt-BR')}</small>`:''}
              ${sent?`<small>Carga enviada: ${new Date(sent.at).toLocaleString('pt-BR')}</small>`:''}
              ${printed?`<small>Impressão confirmada: ${new Date(printed.at).toLocaleString('pt-BR')}</small>`:''}
            </div>`:''}
          </article>`;
        }).join('')}</div>`:''}
      </section>`;
    }).join('')||'<p class="req-muted">Nenhuma solicitação registrada ainda.</p>';
  }
  function changePage(next){if(next==='requests'){next='telegram';window.TelegramRouting?.openCompose?.();}for(const [id,key] of [['pdcPage','pdc'],['telegramPage','telegram'],['monitorPage','monitor'],['printingPage','printing']]){const el=$(id);if(el)el.hidden=next!==key;}const legacy=$('requestsPage');if(legacy)legacy.hidden=true;if(next==='monitor')window.TelegramConnector?.renderMonitor?.();document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===next);b.setAttribute('aria-current',b.dataset.page===next?'page':'false');});window.scrollTo({top:0,behavior:'instant'});}
  function bind(){
    $('supModel').innerHTML='<option value="all">Todos os modelos</option>'+Object.entries(models).map(([k,m])=>`<option value="${k}">${escapeHtml(m.name)}</option>`).join('');
    document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>changePage(el.dataset.page)));
    $('supervisionToggle').addEventListener('click',()=>{$('supervisionBody').classList.toggle('hidden');renderSupervision();});
    $('copySupervisionReport').addEventListener('click',()=>core.copyReport('Aguardando Supervisão',filteredRequests(),true));
    ['supSearch','supCategory','supModel','supStatus'].forEach(k=>$(k).addEventListener(k==='supSearch'?'input':'change',()=>{selected.clear();renderSupervision();}));
    $('supSelectAll').addEventListener('change',e=>{const ids=filteredRequests().filter(x=>['awaiting','not_done'].includes(x.status)).map(x=>x.id);ids.forEach(k=>e.target.checked?selected.add(k):selected.delete(k));renderSupervision();});
    $('supItems').addEventListener('change',e=>{const el=e.target.closest('[data-select-request]');if(el){el.checked?selected.add(el.dataset.selectRequest):selected.delete(el.dataset.selectRequest);renderSupervision();}});
    $('supItems').addEventListener('click',e=>{
      const exp=e.target.closest('[data-expand-request]'),edit=e.target.closest('[data-edit-request]'),retry=e.target.closest('[data-retry-request]');
      if(exp){expanded.has(exp.dataset.expandRequest)?expanded.delete(exp.dataset.expandRequest):expanded.add(exp.dataset.expandRequest);renderSupervision();}
      if(retry){core.reopenRequests([retry.dataset.retryRequest]);renderSupervision();}
      if(edit){const req=allRequests().find(x=>x.id===edit.dataset.editRequest);if(!req)return;const ci=prompt('CI (2 a 14 dígitos):',req.ci||'');if(ci===null)return;const name=prompt('Produto:',req.name||'');if(name===null)return;const cb=prompt('CB (opcional):',req.cb||'');if(cb===null)return;const cat=prompt('Categoria PDC: increase, decrease, new, promo ou other',req.pdcCategory);if(cat===null)return;if(!pdcNames[cat])return core.notify('Categoria inválida.',true);core.correctRequest(req.id,{ci:ci.trim(),name:name.trim(),cb:cb.trim(),pdcCategory:cat});}
    });
    $('supApprove').addEventListener('click',()=>{const ids=[...selected];const result=core.approveRequests(ids);if(result){selected.clear();core.notify(result.approved+' item(ns) encaminhados ao PDC.'+(result.missing?' '+result.missing+' precisam de CI e nome válidos.':''));}});
    $('supReject').addEventListener('click',()=>{const ids=[...selected];if(!ids.length)return;const reason=prompt('Motivo de não realização (opcional):','');if(reason===null)return;if(!confirm('Marcar '+ids.length+' solicitação(ões) como não realizadas?'))return;if(core.rejectRequests(ids,reason)){selected.clear();core.notify('Registro de não realização salvo.');}});
    $('reqHistoryToggle').addEventListener('click',()=>{$('reqHistory').classList.toggle('hidden');renderHistory();});
    $('reqHistory').addEventListener('click',async e=>{
      const copyButton=e.target.closest('[data-history-copy]');
      if(copyButton){
        const request=allRequests().find(r=>r.id===copyButton.dataset.historyCopy);
        const content=request?.message||request?.originalLine||'';
        if(content && await copy(content)){
          copyButton.textContent='✓';
          setTimeout(()=>{if(copyButton.isConnected)copyButton.textContent='⧉';},1400);
        }
        return;
      }
      const groupButton=e.target.closest('[data-history-group]');
      if(groupButton){
        const type=groupButton.dataset.historyGroup;
        historyOpenTypes.has(type)?historyOpenTypes.delete(type):historyOpenTypes.add(type);
        renderHistory();return;
      }
      const itemButton=e.target.closest('[data-history-item]');
      if(itemButton){
        const recordId=itemButton.dataset.historyItem;
        historyOpenItems.has(recordId)?historyOpenItems.delete(recordId):historyOpenItems.add(recordId);
        renderHistory();
      }
    });
  }
  bind();core.onWorkspaceChange(renderSupervision);renderSupervision();
})();
