/* Solicitações: complementa o Controle PDC sem substituir seu fluxo de carga. */
(() => {
  "use strict";
  const core = window.ControlPDC;
  if (!core) return;
  const $ = id => document.getElementById(id);
  const cats = [
    {name:"Cadastros", ids:["cadastro","grade"]},
    {name:"Códigos e Identificação", ids:["cb","troca","ean"]},
    {name:"Preços e Custos", ids:["preco","verificarPreco","custo","verificarValores"]},
    {name:"Grades e Unidades", ids:["desmembrar"]},
    {name:"Promoções e Validades", ids:["promoEntrar","promoSair","validadeAdd","validadeRemove"]},
    {name:"Dados do Produto", ids:["nome"]}
  ];
  const models = {
    cadastro:{name:"Cadastro de Produto", cat:"new", multi:true},
    grade:{name:"Cadastro em Grade",cat:"new",multi:true},
    cb:{name:"Atualização de CB",cat:"other",multi:true},
    troca:{name:"Troca de CI/CB",cat:"other",custom:true},
    ean:{name:"Adicionar CI ou CB no EAN",cat:"other"},
    preco:{name:"Ajuste de Preço",cat:"other"},
    verificarPreco:{name:"Verificação de Preço",cat:"other"},
    custo:{name:"Adicionar Valor de Custo",cat:"other"},
    verificarValores:{name:"Verificar Valores",cat:"other",custom:true},
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
  const id = () => (crypto?.randomUUID?.() || Date.now()+"-"+Math.random().toString(36).slice(2));
  let model = "cadastro", draft = {}, rowCount = 1, selected = new Set(), search = "", openCategory = "Cadastros";
  let page = "pdc", statusView = "open", previewMessage = "", expanded = new Set();
  const historyOpenTypes = new Set(), historyOpenItems = new Set();
  const field = (name,label,opts={}) => `<label class="req-field ${opts.wide?'wide':''}">${escapeHtml(label)}<input data-field="${name}" ${opts.required?'required':''} ${opts.inputmode?`inputmode="${opts.inputmode}"`:''} value="${escapeHtml(draft[name]||'')}" placeholder="${escapeHtml(opts.hint||'')}" autocomplete="off"></label>`;
  const select = (name,label,choices) => `<label class="req-field">${escapeHtml(label)}<select data-field="${name}">${choices.map(([k,v])=>`<option value="${k}" ${String(draft[name]||'')===k?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`;
  const rowField = (n,key,label) => `<label class="req-field">${escapeHtml(label)}<input data-row="${n}" data-key="${key}" value="${escapeHtml((draft.rows||[])[n]?.[key]||'')}" autocomplete="off"></label>`;
  function defaultDraft(type) { return {category:models[type].cat,eanMode:"CI",unit:"Un",rows:[{}],date:"",memo:""}; }
  function setModel(next) {model=next; draft=defaultDraft(next); rowCount=1; renderModels(); renderForm();}
  function rows() { return models[model].multi ? (draft.rows||[{}]) : [draft]; }
  function value(n) {return String(n??'').trim();}
  function formatMoney(s) {
    const raw=value(s).replace(/^R\$\s*/,"").replace(/\s/g,"");
    if(!raw)return "";
    const val=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);
    return Number.isFinite(val)&&val>=0 ? val.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) : null;
  }
  function dateValue(s) {
    const raw=value(s);
    if(!raw)return '';
    const match=raw.match(/^(\d{2})(\d{2})(\d{4})$/)||raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
    if(!match)return null;
    const day=Number(match[1]),month=Number(match[2]),year=Number(match[3].length===2?'20'+match[3]:match[3]);
    const d=new Date(year,month-1,day);
    if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return null;
    return String(day).padStart(2,'0')+'/'+String(month).padStart(2,'0')+'/'+year;
  }
  function code(row) {return value(row.ci||row.cb);}
  function validate() {
    if(models[model].custom && !value(draft.customText))return "Escreva e confira o texto deste modelo antes de concluir.";
    if(!rows().some(r=>value(r.ci||r.cb)))return "Informe o CI ou CB de pelo menos um produto.";
    if(model==='grade' && (!value(draft.rootCI)||!value(draft.rootName))) return "Informe o CI principal e o nome da grade.";
    if(model==='ean' && draft.eanMode==='CB' && !value(draft.cb)) return "Informe o CB a adicionar no EAN.";
    if(model==='cb' && rows().some(r=>!value(r.ci)||!value(r.newCB))) return "Informe o CI e o novo CB de cada produto.";
    for(const row of rows()) if((row.cost && formatMoney(row.cost)===null)||(row.sale && formatMoney(row.sale)===null)) return "Verifique os valores: use números positivos.";
    for(const row of rows()) if(row.date && dateValue(row.date)===null)return "A validade deve ser uma data válida, como 27102026 ou 27/10/2026.";
    if(model==='custo' && !value(draft.cost))return "Informe o custo.";
    return "";
  }
  function messageForRow(r) {
    const ci=value(r.ci), cb=value(r.cb), name=value(r.name);
    const line=code(r)+(name?' - '+name:'');
    const unit=draft.unit==='Personalizado'?value(draft.customUnit):draft.unit;
    const qty=value(draft.qty);
    switch(model){
      case 'cadastro':return line;
      case 'grade':return line;
      case 'cb':return `${line}\nCB: ${value(r.newCB)}`;
      case 'desmembrar':return line+(qty?' - '+qty:'');
      case 'promoEntrar':return line+(value(r.qty)?' - '+value(r.qty):'')+(value(r.date)?' - Até data: '+(dateValue(r.date)||r.date):'');
      case 'promoSair':return line;
      case 'validadeAdd':return line+(value(r.date)?' - Até data: '+(dateValue(r.date)||r.date):'');
      case 'validadeRemove':return line;
      case 'ean':return `CI - ${ci}`+(draft.eanMode==='CB'?`\nCB: ${cb}`:'');
      case 'nome':return `CI - ${ci}\n\nDE:\n${value(r.oldName)}\n\nPARA:\n${value(r.newName)}`;
      case 'preco':case 'verificarPreco':{
        const cost=formatMoney(r.cost),sale=formatMoney(r.sale);
        const label=(model==='verificarPreco'||(!cost&&!sale))?'Por favor, verificar o preço:':'Por favor, ajustar o preço:';
        return `${label}\nCI - ${ci}`+(cost&&model!=='verificarPreco'?`\nCusto: ${cost}`:'')+(sale&&model!=='verificarPreco'?`\nVenda: ${sale}`:'')+(r.memo?'\n'+r.memo:'');
      }
      case 'custo':return `Por favor, adicionar o valor de custo:\nCI - ${ci}\nCusto: ${formatMoney(r.cost)||''}`;
      default:return '';
    }
  }
  function message() {
    if(models[model].custom) return draft.customText || '';
    const text=rows().map(messageForRow).filter(Boolean);
    switch(model){
      case 'cadastro':return 'Por favor, cadastrar:\n'+text.join('\n');
      case 'grade':return `Por favor, cadastrar na grade do CI ${value(draft.rootCI)} - ${value(draft.rootName)}.\n`+text.join('\n');
      case 'cb':return 'Por favor, atualizar CB:\n'+text.join('\n\n');
      case 'desmembrar':return 'Por favor, desmembrar em '+(draft.unit==='Personalizado'?value(draft.customUnit):draft.unit)+(value(draft.qty)?' ('+value(draft.qty)+')':'')+':\n'+text.join('\n────────\n');
      case 'promoEntrar':return 'Por favor, colocar em Promoção:\n'+text.join('\n');
      case 'promoSair':return 'Por favor, retirar a Promoção:\n'+text.join('\n');
      // O organizador antigo intitulava essas ações como validade promocional.
      case 'validadeAdd':return 'Por favor, colocar em Promoção:\n'+text.join('\n');
      case 'validadeRemove':return 'Por favor, retirar a Promoção:\n'+text.join('\n');
      case 'ean':return `Por favor, adicionar o ${draft.eanMode} no EAN:\n`+text[0];
      case 'nome':return 'Por favor, alterar nomenclatura:\n'+text[0];
      default:return text[0]||'';
    }
  }
  function renderModels(){
    const q=norm($('reqModelSearch').value), category=$('reqModelCategory').value;
    $('reqCategories').innerHTML=cats.map(cat=>{
      if(category!=='all'&&category!==cat.name)return '';
      const visible=cat.ids.filter(k=>norm(models[k].name).includes(q)||norm(cat.name).includes(q));
      if(!visible.length)return '';
      const open=openCategory===cat.name||Boolean(q);
      return `<section class="req-model-group"><button type="button" class="req-group-title" data-cat="${escapeHtml(cat.name)}" aria-expanded="${open}"><strong>${escapeHtml(cat.name)}</strong><span>${visible.length} modelos ${open?'⌃':'⌄'}</span></button>${open?`<div class="req-model-choices">${visible.map(k=>`<button type="button" data-model="${k}" class="req-model-chip ${k===model?'active':''}">${escapeHtml(models[k].name)}</button>`).join('')}</div>`:''}</section>`;
    }).join('')||'<p class="req-muted">Nenhum modelo encontrado.</p>';
  }
  function renderForm(){
    const m=models[model], showRows=m.multi;
    const rowsHtml=()=>rows().map((r,i)=>`<div class="req-product-row"><div class="req-product-head"><b>Produto ${i+1}</b>${showRows&&rows().length>1?`<button type="button" class="btn btn-link" data-remove-row="${i}">Remover</button>`:''}</div><div class="req-fields">${rowField(i,'ci','CI')}${rowField(i,'cb','CB (opcional)')}${rowField(i,'name','Nome do produto')}${model==='cb'?rowField(i,'newCB','Novo CB'):''}${['promoEntrar','validadeAdd'].includes(model)?rowField(i,'date','Validade (dd/mm/aaaa)'):''}${model==='promoEntrar'?rowField(i,'qty','Quantidade'):''}</div><div class="req-row-copy"><button type="button" data-copy-row="${i}" class="btn btn-ghost btn-small">Copiar produto</button><button type="button" data-copy-ci="${i}" class="btn btn-link">CI</button><button type="button" data-copy-cb="${i}" class="btn btn-link">CB</button><button type="button" data-copy-name="${i}" class="btn btn-link">Nome</button></div></div>`).join('');
    let extras='';
    if(model==='grade')extras=field('rootCI','CI principal',{required:true})+field('rootName','Nome da grade');
    if(model==='desmembrar')extras=select('unit','Unidade', [['Un','Un.'],['Metro','Metro'],['1/2 Metro','1/2 Metro'],['Personalizado','Personalizado']])+field('qty','Quantidade (opcional)')+(draft.unit==='Personalizado'?field('customUnit','Nome da unidade'):"");
    if(model==='ean')extras=select('eanMode','Código a adicionar no EAN',[['CI','CI'],['CB','CB']]);
    const simple = !m.multi ? `<div class="req-fields">${field('ci','CI',{required:true})}${model==='ean'&&draft.eanMode==='CB'?field('cb','CB'):''}${field('name','Nome do produto (para o PDC)')}${model==='nome'?field('oldName','Nome atual')+field('newName','Novo nome'):''}${model==='preco'?field('cost','Custo (R$)',{inputmode:'decimal'})+field('sale','Venda (R$)',{inputmode:'decimal'}):''}${model==='custo'?field('cost','Custo (R$)',{inputmode:'decimal'}):''}</div><div class="req-row-copy"><button type="button" data-copy-ci="0" class="btn btn-link">Copiar CI</button><button type="button" data-copy-cb="0" class="btn btn-link">Copiar CB</button><button type="button" data-copy-name="0" class="btn btn-link">Copiar nome</button></div>` : rowsHtml();
    const warning=m.custom?'<p class="req-warning">O texto definitivo deste modelo não foi encontrado no arquivo original. Digite e confira a mensagem antes de registrar.</p>':'';
    $('reqForm').innerHTML=`<div class="req-form-heading"><div><small>MODELO SELECIONADO</small><h3>${escapeHtml(m.name)}</h3></div><button type="button" class="btn btn-ghost btn-small" id="reqClear">Limpar</button></div><div class="req-fields">${extras}</div>${simple}${showRows?'<button type="button" class="btn btn-soft btn-small req-add" id="reqAddRow">＋ Adicionar produto</button>':''}${['preco','verificarPreco'].includes(model)?`<label class="req-wide-note">Observação (opcional; texto livre)<textarea data-field="memo" rows="2" placeholder="">${escapeHtml(draft.memo||'')}</textarea></label>`:''}${m.custom?`${warning}<label class="req-wide-note">Mensagem personalizada<textarea data-field="customText" rows="6" placeholder="Escreva o texto revisado deste modelo">${escapeHtml(draft.customText||'')}</textarea></label>`:''}<label class="req-field req-category-picker">Categoria sugerida no PDC<select data-field="category">${Object.entries(pdcNames).map(([key,v])=>`<option value="${key}" ${draft.category===key?'selected':''}>${v}</option>`).join('')}</select></label>${model==='preco'?'<p class="req-muted">Para Aumento ou Redução, escolha explicitamente a categoria; custos e preços isolados não determinam a direção.</p>':''}<div class="req-message"><div class="req-preview-head"><strong>Pré-visualização</strong><button type="button" id="reqCopy" class="btn btn-ghost btn-small">Copiar mensagem</button></div><pre id="reqPreview"></pre></div><div class="req-form-actions"><button type="button" class="btn btn-primary" id="reqSave">Concluir solicitação → Supervisão</button></div>`;
    updatePreview();
  }
  function updatePreview(){previewMessage=message(); if($('reqPreview'))$('reqPreview').textContent=previewMessage;}
  async function copy(str){try{await navigator.clipboard.writeText(str);core.notify('Copiado.');return true;}catch(_){core.notify('Não foi possível copiar. Verifique a permissão do navegador.',true);return false;}}
  function readForm(target){
    const el=target.closest('[data-field],[data-row]'); if(!el)return;
    if(el.dataset.row!==undefined){const i=Number(el.dataset.row);draft.rows[i] ||= {};draft.rows[i][el.dataset.key]=el.value;}
    else {const key=el.dataset.field;draft[key]=el.value;if(key==='eanMode'||key==='unit'){renderForm();return;}}
    updatePreview();
  }
  function save(){
    const error=validate();if(error)return core.notify(error,true);
    const msg=message();if(!msg.trim())return core.notify('Preencha o modelo antes de registrar.',true);
    const submissionId=id(), createdAt=new Date().toISOString();
    const entries=rows().filter(r=>code(r)).map((r,i)=>({
      id:id(),submissionId,position:i,modelId:model,modelName:models[model].name,modelGroup:cats.find(c=>c.ids.includes(model))?.name,
      pdcCategory:draft.category||models[model].cat,ci:value(r.ci),cb:value(model==='cb'?r.newCB:r.cb),name:value(r.name||r.newName||r.oldName),
      cost:formatMoney(r.cost)||'',sale:formatMoney(r.sale)||'',note:value(r.memo),validity:dateValue(r.date)||'',
      fields:JSON.parse(JSON.stringify({...draft,item:r})),message:msg,originalLine:messageForRow(r)||msg,
      createdAt,status:'awaiting',reviewedAt:'',reason:'',pdcItemId:null
    }));
    if(!entries.length)return core.notify('Nenhum produto identificado.',true);
    const known=core.read();
    const repeated=entries.filter(e=>e.ci && (
      known.requests?.some(r=>r.ci===e.ci&&r.status!=='approved') ||
      known.items?.some(i=>!i.deletedAt&&i.ci===e.ci)
    ));
    if(repeated.length && !confirm(repeated.length+' CI(s) já aparecem em solicitações ou no PDC. Registrar mesmo assim como pedidos independentes?'))return;
    if(core.createRequests(entries)) {core.notify(entries.length+' solicitação(ões) enviada(s) para supervisão.');setModel(model);}
  }
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
      return `<article class="sup-item ${r.status}"><div class="sup-main">${waiting?`<input type="checkbox" data-select-request="${escapeHtml(r.id)}" ${selected.has(r.id)?'checked':''} aria-label="Selecionar solicitação">`:'<span class="sup-check-placeholder"></span>'}<div class="sup-item-text"><strong>${escapeHtml(r.ci||r.cb||'Sem CI')} <span>${escapeHtml(r.name)}</span></strong><small>${escapeHtml(r.modelName)} · ${escapeHtml(pdcNames[r.pdcCategory]||'Outros')} · ${new Date(r.createdAt).toLocaleDateString('pt-BR')}</small></div>${source}<button type="button" data-expand-request="${escapeHtml(r.id)}" class="btn btn-ghost btn-small" aria-expanded="${open}">${open?'Ocultar':'Detalhes'}</button></div>${open?`<div class="sup-detail"><pre>${escapeHtml(r.message)}</pre><p>CB: ${escapeHtml(r.cb||'—')} · Custo: ${escapeHtml(r.cost||'—')} · Venda: ${escapeHtml(r.sale||'—')}</p>${r.reason?`<p>Motivo: ${escapeHtml(r.reason)}</p>`:''}${waiting?`<div class="sup-detail-actions"><button type="button" class="btn btn-soft btn-small" data-edit-request="${escapeHtml(r.id)}">Corrigir dados</button>${r.status==='not_done'?`<button type="button" class="btn btn-soft btn-small" data-retry-request="${escapeHtml(r.id)}">Reenviar à supervisão</button>`:''}</div>`:''}</div>`:''}</article>`;
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
                <strong>${escapeHtml(r.ci||r.cb||'Sem CI')} · ${escapeHtml(r.name||r.modelName||'Produto')}</strong>
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
  function changePage(next){page=next;$('pdcPage').hidden=next!=='pdc';$('requestsPage').hidden=next!=='requests';document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===next);b.setAttribute('aria-current',b.dataset.page===next?'page':'false');});if(next==='requests'){renderModels();renderForm();}window.scrollTo({top:0,behavior:'instant'});}
  function bind(){
    $('supModel').innerHTML='<option value="all">Todos os modelos</option>'+Object.entries(models).map(([k,m])=>`<option value="${k}">${escapeHtml(m.name)}</option>`).join('');
    document.querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>changePage(el.dataset.page)));
    $('reqModelSearch').addEventListener('input',renderModels);
    $('reqModelCategory').addEventListener('change',renderModels);
    $('reqCategories').addEventListener('click',e=>{const m=e.target.closest('[data-model]'),c=e.target.closest('[data-cat]');if(m)setModel(m.dataset.model);else if(c){openCategory=openCategory===c.dataset.cat?'':c.dataset.cat;renderModels();}});
    $('reqForm').addEventListener('input',e=>readForm(e.target));
    $('reqForm').addEventListener('change',e=>readForm(e.target));
    $('reqForm').addEventListener('click',e=>{
      const remove=e.target.closest('[data-remove-row]'),cp=e.target.closest('[data-copy-row]'),ci=e.target.closest('[data-copy-ci]'),cb=e.target.closest('[data-copy-cb]'),name=e.target.closest('[data-copy-name]');
      if(remove){draft.rows.splice(Number(remove.dataset.removeRow),1);renderForm();return;}
      if(cp){copy(messageForRow(rows()[Number(cp.dataset.copyRow)]));return;}
      if(ci){copy(value(rows()[Number(ci.dataset.copyCi)]?.ci));return;}
      if(cb){copy(value(rows()[Number(cb.dataset.copyCb)]?.cb));return;}
      if(name){copy(value(rows()[Number(name.dataset.copyName)]?.name));return;}
      if(e.target.closest('#reqAddRow')){draft.rows.push({});renderForm();return;}
      if(e.target.closest('#reqClear')){setModel(model);return;}
      if(e.target.closest('#reqCopy')){copy(message());return;}
      if(e.target.closest('#reqSave'))save();
    });
    $('supervisionToggle').addEventListener('click',()=>{$('supervisionBody').classList.toggle('hidden');renderSupervision();});
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
  bind();setModel('cadastro');core.onWorkspaceChange(renderSupervision);renderSupervision();
  window.PDCSolicitacoesTest={message:()=>message(),models,formatMoney,setModel,readDraft:()=>draft,validate};
})();
