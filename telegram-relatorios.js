/* Relatórios TXT do Monitoramento Telegram.
 * Fonte: histórico local já sincronizado. Não consulta o Telegram ao exportar.
 * Cada arquivo contém exatamente um grupo/tópico selecionado. */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const plain=value=>String(value??"").replace(/\r\n?/g,"\n");
  const formatDate=value=>{
    const d=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(d.getTime()))return "Data não disponível";
    return d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false});
  };
  const formatCutoff=value=>{
    const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return match?match[3]+"/"+match[2]+"/"+match[1]+" às "+match[4]+":"+match[5]:formatDate(value);
  };
  const labels={
    all:"Todas as categorias",cb:"Atualizações de CB",produto:"Produtos novos",
    preco:"Atualizações de preços (AUMENTOU/BAIXOU)",solicitacao:"Solicitações",outras:"Outras mensagens"
  };
  const sectionKeys=["cb","produto","preco","solicitacao","outras"];
  const headings={
    cb:"ATUALIZAÇÕES DE CB",produto:"PRODUTOS NOVOS",preco:"ALTERAÇÕES DE PREÇO",
    solicitacao:"SOLICITAÇÕES",outras:"OUTRAS MENSAGENS"
  };
  function classify(record){
    const text=plain(record.text),header=text.slice(0,130);
    if(/\b(?:atualiza(?:r|[cç][aã]o)|troca(?:r)?|alterar|corrigir)\b.{0,38}\b(?:CB|c[oó]digo(?:s)?\s+de\s+barras)\b/i.test(header)
      ||/^\s*ATUALIZA[CÇ][AÃ]O\s+(?:DE\s+)?CB/i.test(header))return "cb";
    if(record.kind==="produto"||/^\s*(?:PRODUTOS?\s+NOVOS?|NOVOS?\s+PRODUTOS?)\b/i.test(header))return "produto";
    if(record.kind==="preco"||/^\s*(?:AUMENTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|AJUSTE\s+DE\s+PRE[CÇ]O)\b/i.test(header)
      ||/\b\d{1,12}\s*(?:[-–]\s*)?(?:AUMENTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|SUBIU|REAJUSTOU|CAIU)\s+(?:PARA|PRA|P\/)\s*(?:R\$\s*)?\d[\d.,]*[.,]\d{2}\b/i.test(text))return "preco";
    if(record.kind==="solicitacao")return "solicitacao";
    return "outras";
  }
  function parseProducts(source,category="outras"){
    const items=[],lines=plain(source).split("\n");
    let current=null;
    for(const value of lines){
      const line=value.trim();
      if(!line)continue;
      // CI e CB nunca são confundidos: padrões numéricos avulsos não viram CI.
      const code=line.match(/^CI\s*[:=#-]\s*(\d{1,12})(?:\s*[-–]\s*(.+))?$/i)
        ||line.match(/^(\d{1,12})\s*[-–]\s*(\S.*)$/);
      if(code){
        current={ci:code[1],name:(code[2]||"").trim(),cb:"",sale:"",cost:""};
        if(category==="preco"){
          const trailing=current.name.match(/\s+-\s+(?:R\$\s*)?(\d+[.,]\d{2})\s*$/);
          if(trailing){current.sale=trailing[1];current.name=current.name.slice(0,trailing.index).trim();}
        }
        items.push(current);continue;
      }
      const cb=line.match(/^(?:CB|C[OÓ]DIGO\s+DE\s+BARRAS)\s*[:=-]\s*(\S+)/i);
      if(cb&&current){current.cb=cb[1].trim();continue;}
      const venda=line.match(/^(?:VALOR\s+DE\s+VENDA|VENDA|PRE[CÇ]O(?:\s+DE\s+VENDA)?)\s*[:=-]\s*(?:R\$\s*)?([\d.,]+)/i);
      if(venda&&current){current.sale=venda[1].trim();continue;}
      const custo=line.match(/^(?:CUSTO|VALOR\s+DE\s+CUSTO)\s*[:=-]\s*(?:R\$\s*)?([\d.,]+)/i);
      if(custo&&current){current.cost=custo[1].trim();continue;}
      if(category==="preco"&&current){
        const standalone=line.match(/^(?:R\$\s*)?(\d{1,10}[,.]\d{2})\s*$/);
        if(standalone){current.sale=standalone[1];continue;}
      }
    }
    return items;
  }
  function recordDirection(record){
    if(record.direction==="enviadas"||record.direction==="recebidas")return record.direction;
    return record.kind==="solicitacao"||!record.kind?"enviadas":"recebidas";
  }
  function titleOf(record){
    return plain(record.text).split("\n").map(s=>s.trim()).find(Boolean)||"Sem título";
  }
  function getRecords(all,opts){
    const from=new Date(opts.from).getTime();
    if(!opts.from||!Number.isFinite(from))throw new Error("Selecione uma data e hora inicial válidas.");
    if(!opts.group||!opts.group.id)throw new Error("Selecione um grupo no monitoramento.");
    if(opts.group.isForum && (!opts.topicId||!availableReportTopics(opts.group).some(t=>t.id===String(opts.topicId))))
      throw new Error("Escolha um tópico válido para gerar um TXT separado por chat.");
    if(!labels[opts.kind||"all"])throw new Error("Tipo de relatório inválido.");
    if(!["all","enviadas","recebidas"].includes(opts.direction||"all"))throw new Error("Origem de mensagem inválida.");
    return (all||[]).filter(r=>{
      const date=new Date(r.date).getTime();
      if(!Number.isFinite(date)||date<from)return false;
      if(r.telegramId!==opts.group.id)return false;
      if(opts.group.isForum&&String(r.topicId??"")!==String(opts.topicId))return false;
      if((opts.direction||"all")!=="all"&&recordDirection(r)!==opts.direction)return false;
      return (opts.kind||"all")==="all"||classify(r)===opts.kind;
    }).sort((a,b)=>new Date(a.date)-new Date(b.date)||(Number(a.messageId)||0)-(Number(b.messageId)||0));
  }

  function movementOf(text){
    const value=String(text||"");
    if(/\b(?:ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU|QUEDA)\b/i.test(value))return "BAIXOU";
    if(/\b(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU)\b/i.test(value))return "AUMENTOU";
    return "";
  }
  function materialHeading(line){
    let value=String(line||"").trim();
    if(!value || value.length>85 || /^POR\s+FAVOR\b/i.test(value))return "";
    const labeled=value.match(/^(?:MARCA|MATERIAL|FABRICANTE|FAM[IÍ]LIA|LINHA|FORNECEDOR)\s*[:=-]\s*(.+)$/i);
    if(labeled)value=labeled[1].trim();
    else{
      // Ex.: "AUMENTOU - PRAFESTY" e "PRAFESTY - BAIXOU".
      const actionFirst=value.match(/^(?:AUMENTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|PRODUTOS?\s+NOVOS?)\s*[:–-]\s*(.+)$/i);
      const actionLast=value.match(/^(.+?)\s*[:–-]\s*(?:AUMENTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU)$/i);
      if(actionFirst)value=actionFirst[1].trim();
      else if(actionLast)value=actionLast[1].trim();
      else{
        const uppercase=value===value.toLocaleUpperCase("pt-BR") && /[\p{L}]/u.test(value);
        const oneWord=/^[\p{L}][\p{L}\p{M}\d&.-]{2,50}$/u.test(value);
        if(!uppercase&&!oneWord)return "";
      }
    }
    value=value.replace(/[.:;,-]+$/,"").trim();
    if(value.length<2||value.length>65||/^\d+$/.test(value))return "";
    if(/^(?:POR\s+FAVOR|SOLICITA[CÇ][AÃ]O|CADASTRO|CADASTROS|PRODUTOS?\s+NOVOS?|NOVOS?\s+PRODUTOS?|AUMENTOU|AUMENTO|BAIXOU|ABAIXOU|DIMINUIU|REDUZIU|REAJUSTOU|ATUALIZA[CÇ][AÃ]O|ALTERA[CÇ][AÃ]O|MATERIAIS|MATERIAL|CB|CI|PRE[CÇ]O|VALOR|VENDA|CUSTO|NOTA\s+FISCAL|NF-E)(?:\s+.*)?$/i.test(value))return "";
    if(/^(?:\d+\s*[-–]|CB\s*[:=-]|CI\s*[:=-])/i.test(value))return "";
    return value;
  }

  // Avisos da equipe podem escrever CI seguido por espaço ou hífen:
  // 83971 ABAIXOU PARA 11,50
  // 168465 - AUMENTOU PARA 4,99
  // 10001 - DESCRIÇÃO DO ITEM - DIMINUIU PARA 7,20
  const priceNumber="\\d[\\d.,]*[.,]\\d{2}";
  const actionWord="AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU";
  function actionLabel(text){
    const m=String(text||"").match(new RegExp("\\b("+actionWord+")\\b","i"));
    return m?m[1].toLocaleUpperCase("pt-BR"):"";
  }
  function normalizeAmount(input){
    const match=String(input||"").match(new RegExp("^(?:R\\$\\s*)?("+priceNumber+")$","i"));
    return match?match[1]:"";
  }
  function parseActionAndValue(source){
    const value=String(source||"").trim();
    const direct=new RegExp("^(?:(.*?)\\s*[-–]\\s*)?("+actionWord+")\\s+(?:PARA|PRA|P\\/)\\s*(?:R\\$\\s*)?("+priceNumber+")\\s*$","i");
    const withoutDash=new RegExp("^(.*?)\\s+("+actionWord+")\\s+(?:PARA|PRA|P\\/)\\s*(?:R\\$\\s*)?("+priceNumber+")\\s*$","i");
    const match=value.match(direct)||value.match(withoutDash);
    if(match)return {name:(match[1]||"").trim(),action:match[2].toLocaleUpperCase("pt-BR"),amount:match[3]};
    const flag=new RegExp("^(?:(.*?)\\s*[-–]\\s*)?("+actionWord+")\\s*$","i");
    const f=value.match(flag);
    if(f)return {name:(f[1]||"").trim(),action:f[2].toLocaleUpperCase("pt-BR"),amount:""};
    return null;
  }
  function parseMaterialProducts(record){
    const lines=plain(record.text).split("\n"),items=[],category=classify(record);
    let material="",globalAction="",current=null;
    for(const raw of lines){
      const line=raw.trim();
      if(!line)continue;
      // CIs sem hífen passam a ser reconhecidos; preços com vírgula não
      // correspondem à expressão regular de início de produto.
      const ci=line.match(/^CI\s*[:=#-]?\s*(\d{1,12})(?:\s*[-–]\s*|\s+)(\S.*)$/i)
        ||line.match(/^(\d{1,12})(?:\s*[-–]\s*|\s+)(\S.*)$/);
      if(ci){
        let description=ci[2].trim(),action="",amount="";
        const parsed=parseActionAndValue(description);
        if(parsed){
          description=parsed.name;action=parsed.action;amount=parsed.amount;
        }else if(category==="preco"){
          const suffix=description.match(new RegExp("\\s+[-–]\\s*(?:R\\$\\s*)?("+priceNumber+")\\s*$","i"));
          if(suffix){amount=suffix[1];description=description.slice(0,suffix.index).trim();}
        }
        current={ci:ci[1],name:description,cb:"",material,
          action:action||globalAction,amount,movement:""};
        items.push(current);continue;
      }
      const cb=line.match(/^(?:CB|C[OÓ]DIGO\s+DE\s+BARRAS)\s*[:=-]\s*(\S+)/i);
      if(cb&&current){current.cb=cb[1].trim();continue;}
      const heading=materialHeading(line);
      if(heading){
        material=heading;
        const flag=actionLabel(line);
        if(flag)globalAction=flag;
        current=null;continue;
      }
      const actionOnly=parseActionAndValue(line);
      if(category==="preco"&&actionOnly&&!actionOnly.name){
        if(current){current.action=actionOnly.action;current.amount=actionOnly.amount||current.amount;}
        else globalAction=actionOnly.action;
        continue;
      }
      if(category==="preco" && new RegExp("^("+actionWord+")\\s*[:.!-]?\\s*$","i").test(line)){
        globalAction=actionLabel(line);current=null;continue;
      }
      if(!current)continue;
      const sale=line.match(new RegExp("^(?:VALOR\\s+DE\\s+VENDA|VENDA|PRE[CÇ]O(?:\\s+DE\\s+VENDA)?|VALOR\\s+ATUAL|NOVO\\s+VALOR|PARA|ATUAL)\\s*[:=-]\\s*(?:R\\$\\s*)?("+priceNumber+")\\s*$","i"));
      if(sale&&category==="preco"){current.amount=sale[1];continue;}
      const paired=line.match(new RegExp("\\bPARA\\s*[:=-]?\\s*(?:R\\$\\s*)?("+priceNumber+")\\b","i"));
      if(paired&&category==="preco"){current.amount=paired[1];continue;}
      if(category==="preco"){
        const standalone=normalizeAmount(line);
        if(standalone)current.amount=standalone;
      }
    }
    for(const item of items){
      item.movement=item.action?(item.amount?item.action+" PARA "+item.amount:item.action):
        (category==="preco"&&item.amount?"R$ "+item.amount:"");
      delete item.action;delete item.amount;
    }
    return items;
  }
  function consolidate(records){
    const map=new Map();
    // Preservar a ordem de ocorrência, em vez de ordenar marcas alfabeticamente.
    for(const rec of records){
      for(const item of parseMaterialProducts(rec)){
        if(!item.ci)continue;
        let existing=map.get(item.ci);
        if(!existing){
          existing={ci:item.ci,name:"",cb:"",material:"",movement:"",last:rec,count:0};
          map.set(item.ci,existing);
        }
        existing.last=rec;existing.count++;
        if(item.name)existing.name=item.name;
        if(item.cb)existing.cb=item.cb;
        if(item.material)existing.material=item.material;
        if(item.movement)existing.movement=item.movement;
      }
    }
    return [...map.values()];
  }
  function enrichNames(items,all,group){
    // Complementar descrição/CB apenas quando houver o mesmo CI em outra
    // mensagem sincronizada do MESMO grupo. Nunca inventar nomes.
    const missing=new Set(items.filter(x=>!x.name||!x.cb).map(x=>x.ci));
    if(!missing.size)return;
    const names=new Map(),barcodes=new Map();
    const ordered=(all||[]).filter(r=>r.telegramId===group.id)
      .sort((a,b)=>new Date(a.date)-new Date(b.date)||(Number(a.messageId)||0)-(Number(b.messageId)||0));
    for(const rec of ordered){
      for(const item of parseMaterialProducts(rec)){
        if(!missing.has(item.ci))continue;
        if(item.name)names.set(item.ci,item.name);
        if(item.cb)barcodes.set(item.ci,item.cb);
      }
    }
    for(const item of items){
      if(!item.name&&names.has(item.ci))item.name=names.get(item.ci);
      if(!item.cb&&barcodes.has(item.ci))item.cb=barcodes.get(item.ci);
    }
  }
  function generate(all,opts){
    const records=getRecords(all,opts),group=opts.group;
    const topic=group.isForum?availableReportTopics(group).find(t=>t.id===String(opts.topicId)):null;
    const latest=consolidate(records);
    enrichNames(latest,all,group);
    const customMaterial=String(opts.material||"").trim().slice(0,65);
    const materialGroups=new Map();
    for(const item of latest){
      const material=(item.material||customMaterial||"MATERIAL NÃO INFORMADO").toLocaleUpperCase("pt-BR");
      if(!materialGroups.has(material))materialGroups.set(material,[]);
      materialGroups.get(material).push(item);
    }
    // Ordem das marcas e dos produtos igual à primeira ocorrência no Telegram.
    const sections=[...materialGroups.entries()];
    const lines=[];
    for(const [material,items] of sections){
      if(lines.length)lines.push("");
      lines.push(material,"");
      items.forEach((item,index)=>{
        if(index>0)lines.push("");
        lines.push([item.ci,item.name,item.movement].filter(Boolean).join(" - "));
        if(item.cb)lines.push("CB: "+item.cb);
      });
    }
    if(!lines.length)lines.push("Nenhum produto com CI identificado neste período.");
    const summary={
      total:records.length,uniqueCIs:latest.length,latest,
      materials:sections.map(([title,items])=>({title,items})),
      sections:Object.fromEntries(sectionKeys.map(k=>[k,records.filter(r=>classify(r)===k)]))
    };
    return {text:lines.join("\r\n").trimEnd()+"\r\n",summary,group:group.name,
      topic:topic?.name||"",fileName:filename(group.name+(topic?" / "+topic.name:""),opts.from)};
  }
  function filename(chat,from){
    const safe=chat.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,65)||"Chat";
    const date=String(from).replace(/[^0-9]/g,"").slice(0,12);
    return "RELATORIO_TELEGRAM_"+safe+"_"+date+".txt";
  }
  let opts={from:"",kind:"preco",direction:"recebidas",material:""};
  // O relatório deve listar TODOS os tópicos disponíveis no Telegram.
  // Os tópicos escolhidos para monitoramento são apenas um subconjunto.
  const reportTopicCache=new Map(),reportTopicSelection=new Map(),loadingTopics=new Set();
  function availableReportTopics(group){
    if(!group)return [];
    const topics=new Map();
    for(const topic of group.topics||[])topics.set(String(topic.id),{id:String(topic.id),name:String(topic.name)});
    for(const topic of reportTopicCache.get(group.id)||[])
      topics.set(String(topic.id),{id:String(topic.id),name:String(topic.name)});
    return [...topics.values()];
  }
  function chosenReportTopic(group,activeTopic){
    const found=availableReportTopics(group);
    const preferred=reportTopicSelection.get(group.id)||
      (activeTopic!=="all"?String(activeTopic):"");
    return found.some(topic=>topic.id===preferred)?preferred:found[0]?.id||"";
  }
  function reportTopicOptions(group,selected){
    return availableReportTopics(group).map(topic=>{
      const monitored=(group.topics||[]).some(t=>String(t.id)===topic.id);
      return '<option value="'+esc(topic.id)+'"'+(selected===topic.id?' selected':'')+'>'+
        esc(topic.name)+(monitored?'':' (não monitorado)')+'</option>';
    }).join("");
  }
  function refreshReportTopicDetails(){
    const scope=window.TelegramConnector?.getReportScope?.(),group=scope?.group;
    if(!group?.isForum)return;
    const input=$("tgReportTopic"),hint=$("tgReportTopicHint"),button=$("tgReportAddTopic");
    if(!input)return;
    const topic=availableReportTopics(group).find(t=>t.id===input.value);
    const monitored=!!topic && group.topics.some(t=>String(t.id)===topic.id);
    if(hint){
      hint.textContent=!topic?"Nenhum tópico disponível para este grupo.":
        monitored?"Tópico monitorado. O TXT utilizará as mensagens já sincronizadas dele.":
        "Este tópico ainda não está no monitoramento. Inclua-o, defina a data inicial e sincronize para obter seus avisos de preços.";
    }
    if(button){button.hidden=!topic||monitored;button.disabled=!topic||monitored;}
  }
  function refreshReportTopicOptions(groupId){
    const scope=window.TelegramConnector?.getReportScope?.();
    if(scope?.group?.id!==groupId)return;
    const input=$("tgReportTopic"),group=scope.group;
    if(!input)return;
    const last=reportTopicSelection.get(groupId)||input.value;
    const options=availableReportTopics(group);
    const next=options.some(t=>t.id===last)?last:options[0]?.id||"";
    input.innerHTML=reportTopicOptions(group,next);
    if(next){input.value=next;reportTopicSelection.set(groupId,next);}
    refreshReportTopicDetails();
  }
  async function loadTopics(scope){
    const group=scope?.group;
    if(!group?.isForum)return;
    if(reportTopicCache.has(group.id)){refreshReportTopicOptions(group.id);return;}
    if(loadingTopics.has(group.id))return;
    const status=$("tgReportTopicHint");
    if(!window.TelegramConnector?.connected?.()){
      if(status)status.textContent="Conecte o Telegram para listar todos os tópicos. Por enquanto, aparecem apenas os monitorados.";
      return;
    }
    loadingTopics.add(group.id);
    if(status)status.textContent="Consultando todos os tópicos deste grupo no Telegram…";
    try{
      const topics=await window.TelegramConnector.topics(group.id);
      reportTopicCache.set(group.id,(topics||[]).filter(t=>t&&/^\d+$/.test(String(t.id))&&t.name));
      refreshReportTopicOptions(group.id);
    }catch(e){
      const current=window.TelegramConnector?.getReportScope?.();
      if(current?.group?.id===group.id && $("tgReportTopicHint"))
        $("tgReportTopicHint").textContent="Não foi possível atualizar a lista de tópicos: "+String(e.message||e)+". Confira a conexão.";
    }finally{loadingTopics.delete(group.id);}
  }
  function panelHtml(scope){
    const g=scope?.group;
    if(!g)return '<section class="tg-report-panel"><h3>Relatório TXT por chat</h3><p>Escolha um grupo para habilitar a exportação.</p></section>';
    const chosen=g.isForum?chosenReportTopic(g,scope.activeTopic):"";
    const topicOptions=g.isForum?
      '<label>Tópico do Telegram para o relatório<select id="tgReportTopic">'+reportTopicOptions(g,chosen)+'</select></label>'+
      '<div class="tg-report-topic-help"><small id="tgReportTopicHint">Consultando tópicos do grupo…</small>'+
      '<button type="button" class="btn btn-soft btn-small" id="tgReportAddTopic" hidden>Incluir no monitoramento</button></div>':"";
    const typeOptions=Object.entries(labels).map(([id,label])=>'<option value="'+id+'"'+(opts.kind===id?' selected':'')+'>'+label+'</option>').join("");
    return '<section class="tg-report-panel" aria-labelledby="tgReportHeading">'+
      '<div class="tg-report-head"><div><h3 id="tgReportHeading">Lista simples de produtos (TXT)</h3><p>Apenas material, CI, descrição, AUMENTOU/BAIXOU e CB quando houver. Uma linha por produto, pronta para copiar.</p></div>'+
      '<span>Arquivo .TXT</span></div><p class="tg-report-group-label">Grupo selecionado: <strong>'+esc(g.name)+'</strong>. Para outro grupo, use as abas do Monitoramento.</p>'+
      '<div class="tg-report-fields">'+
      '<label>Iniciar a partir de (data e hora)<input type="datetime-local" id="tgReportFrom" value="'+esc(opts.from)+'"></label>'+
      topicOptions+
      '<label>Tipo de relatório<select id="tgReportKind">'+typeOptions+'</select></label>'+
      '<label>Mensagens<select id="tgReportDirection"><option value="all"'+(opts.direction==="all"?' selected':'')+'>Minhas e recebidas</option>'+
        '<option value="enviadas"'+(opts.direction==="enviadas"?' selected':'')+'>Apenas minhas</option>'+
        '<option value="recebidas"'+(opts.direction==="recebidas"?' selected':'')+'>Apenas recebidas</option></select></label>'+
      '<label>Material para itens sem título (opcional)<input type="text" id="tgReportMaterial" maxlength="65" placeholder="Ex.: Prafesty" value="'+esc(opts.material)+'"></label>'+ 
      '</div><div class="tg-report-sync-tip"><span>Este relatório usa mensagens já capturadas. Se faltar algum registro, sincronize antes de gerar o TXT.</span>'+
      '<button type="button" class="btn btn-soft btn-small" id="tgReportGoSync">↻ Ir para sincronização</button></div>'+
      '<div class="tg-report-actions"><button type="button" class="btn btn-soft" id="tgReportPreviewBtn">Visualizar TXT</button>'+
      '<button type="button" class="btn btn-primary" id="tgReportDownloadBtn">Baixar relatório TXT</button></div>'+
      '<p id="tgReportStatus" class="tg-report-status" role="status" aria-live="polite">Defina o início do período. O arquivo usará o histórico já sincronizado; não buscará mensagens antigas automaticamente.</p>'+
      '<pre id="tgReportPreview" class="tg-report-preview" hidden></pre>'+ 
      '<div id="tgReportQuickCopy" class="tg-report-quick-copy" hidden></div></section>';
  }
  function controlValues(){
    const scope=window.TelegramConnector?.getReportScope?.();
    if(!scope?.group)throw new Error("Selecione um grupo na aba Monitoramento.");
    return {group:scope.group,topicId:scope.group.isForum?$("tgReportTopic")?.value:null,
      from:$("tgReportFrom")?.value||"",kind:$("tgReportKind")?.value||"all",
      direction:$("tgReportDirection")?.value||"all",material:$("tgReportMaterial")?.value||""};
  }
  function createCurrent(){
    const values=controlValues();
    opts={from:values.from,kind:values.kind,direction:values.direction,material:values.material};
    return generate(window.TelegramConnector.readHistory().records,values);
  }
  function clearOutput(){
    const preview=$("tgReportPreview");
    if(preview){preview.hidden=true;preview.textContent="";}
    const quick=$("tgReportQuickCopy");
    if(quick){quick.hidden=true;quick.innerHTML="";}
  }
  function status(message,error=false){
    const el=$("tgReportStatus");
    if(el){el.textContent=message;el.classList.toggle("error",error);}
    if(error)clearOutput();
  }
  const reportFilterIds=new Set(["tgReportFrom","tgReportTopic","tgReportKind","tgReportDirection","tgReportMaterial"]);
  function onFilterChanged(e){
    if(!reportFilterIds.has(e.target?.id))return;
    clearOutput();
    status("Filtro alterado. Toque em Visualizar TXT para gerar a lista com os novos critérios.");
  }
  document.addEventListener("change",e=>{
    if(e.target?.id==="tgReportTopic"){
      const scope=window.TelegramConnector?.getReportScope?.();
      if(scope?.group)reportTopicSelection.set(scope.group.id,e.target.value);
      refreshReportTopicDetails();
    }
    onFilterChanged(e);
  });
  document.addEventListener("input",onFilterChanged);
  function renderQuickCopy(materials){
    const mount=$("tgReportQuickCopy");
    if(!mount)return;
    const groups=materials||[];
    mount.innerHTML='<h4>Copiar códigos para o sistema</h4>'+
      groups.map(group=>'<div class="tg-report-copy-group"><strong>'+esc(group.title)+'</strong>'+
        group.items.map(item=>'<div class="tg-report-copy-row"><span>'+esc([item.ci,item.name,item.movement].filter(Boolean).join(" - "))+'</span>'+
          '<div class="tg-report-copy-buttons"><button type="button" class="btn btn-soft btn-small" data-tg-report-copy="'+esc(item.ci)+'">Copiar CI</button>'+
          (item.cb?'<button type="button" class="btn btn-ghost btn-small" data-tg-report-copy="'+esc(item.cb)+'">Copiar CB</button>':'')+
          '</div></div>').join("")+'</div>').join("");
    mount.hidden=!groups.length;
  }
  document.addEventListener("click",async event=>{
    if(event.target.closest("#tgReportAddTopic")){
      const scope=window.TelegramConnector?.getReportScope?.(),group=scope?.group;
      const topicId=$("tgReportTopic")?.value,topic=group&&availableReportTopics(group).find(t=>t.id===topicId);
      if(!group||!topic)return status("Escolha um tópico primeiro.",true);
      try{
        await window.TelegramConnector.addMonitoredTopic(group.id,topic.id,topic.name);
        status("Tópico "+topic.name+" incluído no monitoramento. Use Ir para sincronização, defina a data inicial e capture as mensagens.");
        refreshReportTopicDetails();
      }catch(e){status("Não foi possível incluir o tópico: "+String(e.message||e),true);}
      return;
    }
    if(event.target.closest("#tgReportGoSync")){
      document.querySelector('[data-page="telegram"]')?.click();
      document.getElementById("tgHeaderSync")?.click();
      document.getElementById("tgSyncSettingsMount")?.scrollIntoView?.({behavior:"smooth",block:"start"});
      return;
    }
    const copy=event.target.closest("[data-tg-report-copy]");
    if(copy){
      const value=copy.getAttribute("data-tg-report-copy")||"";
      if(!value)return;
      try{
        await navigator.clipboard.writeText(value);
        status("Código "+value+" copiado para a área de transferência.");
      }catch(_){status("Não foi possível copiar. Verifique a permissão do navegador.",true);}
      return;
    }

    const preview=event.target.closest("#tgReportPreviewBtn");
    const download=event.target.closest("#tgReportDownloadBtn");
    if(!preview&&!download)return;
    try{
      const result=createCurrent(),count=result.summary.total;
      if(!count){
        const values=controlValues();
        if(values.group.isForum && !values.group.topics.some(t=>t.id===String(values.topicId)))
          throw new Error("Esse tópico ainda não está sendo monitorado. Use 'Incluir no monitoramento' e depois 'Ir para sincronização' antes de gerar o TXT.");
        throw new Error("Nenhuma mensagem de preços encontrada neste tópico com o período e filtros escolhidos. Confira a data inicial ou sincronize esse tópico.");
      }
      if(!result.summary.uniqueCIs)throw new Error("Há mensagens neste filtro, mas nenhuma com CI reconhecido. Experimente 'Todas as categorias' e confira as mensagens originais.");
      if(preview){
        const target=$("tgReportPreview");
        if(target){target.hidden=false;target.textContent=result.text;}
        renderQuickCopy(result.summary.materials);
        status(result.summary.uniqueCIs+" CI(s) em "+result.summary.materials.length+" material(is). Lista pronta para copiar.");
      }else{
        const blob=new Blob(["\uFEFF",result.text],{type:"text/plain;charset=utf-8"});
        const url=URL.createObjectURL(blob),link=document.createElement("a");
        link.href=url;link.download=result.fileName;link.style.display="none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        status("Relatório TXT preparado: "+result.fileName+" ("+count+" mensagens).");
      }
    }catch(err){status(String(err.message||err),true);}
  });
  window.TelegramReports={panelHtml,generate,parseProducts,classify,getRecords,loadTopics,availableReportTopics};
})();