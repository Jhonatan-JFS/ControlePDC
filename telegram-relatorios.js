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
    preco:"Alterações de preço",solicitacao:"Solicitações",outras:"Outras mensagens"
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
    if(record.kind==="preco"||/^\s*(?:AUMENTOU|ABAIXOU|DIMINUIU|REDUZIU|AJUSTE\s+DE\s+PRE[CÇ]O)\b/i.test(header))return "preco";
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
    if(opts.group.isForum && (!opts.topicId||!opts.group.topics.some(t=>t.id===String(opts.topicId))))
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
    if(!value || value.length>85)return "";
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
  function parseMaterialProducts(record){
    const lines=plain(record.text).split("\n"),items=[];
    const category=classify(record);
    let material="",movement="",current=null;
    for(const raw of lines){
      const line=raw.trim();
      if(!line)continue;
      const ci=line.match(/^CI\s*[:=#-]\s*(\d{1,12})(?:\s*[-–]\s*(.+))?$/i)
        ||line.match(/^(\d{1,12})\s*[-–]\s*(\S.*)$/);
      if(ci){
        let description=(ci[2]||"").trim();
        let inlineMovement="";
        const suffix=description.match(/\s*[-–]\s*(AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s*$/i);
        if(suffix){
          inlineMovement=movementOf(suffix[1]);
          description=description.slice(0,suffix.index).trim();
        }
        // Valores no final da linha de preço não são parte do nome.
        if(category==="preco"){
          const price=description.match(/\s*[-–]\s*(?:R\$\s*)?\d+[.,]\d{2}\s*$/i);
          if(price)description=description.slice(0,price.index).trim();
        }
        current={ci:ci[1],name:description,cb:"",material,movement:inlineMovement||(category==="preco"?movement:"")};
        items.push(current);
        continue;
      }
      const cb=line.match(/^(?:CB|C[OÓ]DIGO\s+DE\s+BARRAS)\s*[:=-]\s*(\S+)/i);
      if(cb&&current){current.cb=cb[1].trim();continue;}
      // Valor de venda é ignorado no formato simplificado, não é um CI.
      const heading=materialHeading(line);
      if(heading){if(category==="preco"&&movementOf(line))movement=movementOf(line);material=heading;current=null;continue;}
      if(category==="preco" && /^(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s*[:.!-]?$/i.test(line)){
        movement=movementOf(line);current=null;
      }
    }
    return items;
  }
  function consolidate(records){
    const map=new Map();
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
    return [...map.values()].sort((x,y)=>new Date(y.last.date)-new Date(x.last.date)||
      (Number(y.last.messageId)||0)-(Number(x.last.messageId)||0)||x.ci.localeCompare(y.ci));
  }
  function generate(all,opts){
    const records=getRecords(all,opts),group=opts.group;
    const topic=group.isForum?group.topics.find(t=>t.id===String(opts.topicId)):null;
    const latest=consolidate(records);
    const customMaterial=String(opts.material||"").trim().slice(0,65);
    const materialGroups=new Map();
    for(const item of latest){
      const material=(item.material||customMaterial||"MATERIAL NÃO INFORMADO").toLocaleUpperCase("pt-BR");
      if(!materialGroups.has(material))materialGroups.set(material,[]);
      materialGroups.get(material).push(item);
    }
    const sections=[...materialGroups.entries()].sort((a,b)=>{
      if(a[0]==="MATERIAL NÃO INFORMADO")return 1;
      if(b[0]==="MATERIAL NÃO INFORMADO")return -1;
      return a[0].localeCompare(b[0],"pt-BR");
    });
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
  let opts={from:"",kind:"all",direction:"all",material:""};
  function panelHtml(scope){
    const g=scope?.group;
    if(!g)return '<section class="tg-report-panel"><h3>Relatório TXT por chat</h3><p>Escolha um grupo para habilitar a exportação.</p></section>';
    const topicOptions=g.isForum?
      '<label>Tópico que terá o TXT próprio<select id="tgReportTopic">'+g.topics.map(t=>
        '<option value="'+esc(t.id)+'"'+(String(scope.activeTopic==="all"?(g.topics[0]?.id||""):scope.activeTopic)===t.id?' selected':'')+'>'+esc(t.name)+'</option>'
      ).join("")+'</select></label>':"";
    const typeOptions=Object.entries(labels).map(([id,label])=>'<option value="'+id+'"'+(opts.kind===id?' selected':'')+'>'+label+'</option>').join("");
    return '<section class="tg-report-panel" aria-labelledby="tgReportHeading">'+
      '<div class="tg-report-head"><div><h3 id="tgReportHeading">Lista simples de produtos (TXT)</h3><p>Apenas material, CI, descrição, AUMENTOU/BAIXOU e CB quando houver. Uma linha por produto, pronta para copiar.</p></div>'+
      '<span>Arquivo .TXT</span></div>'+
      '<div class="tg-report-fields">'+
      '<label>Iniciar a partir de (data e hora)<input type="datetime-local" id="tgReportFrom" value="'+esc(opts.from)+'"></label>'+
      topicOptions+
      '<label>Tipo de relatório<select id="tgReportKind">'+typeOptions+'</select></label>'+
      '<label>Mensagens<select id="tgReportDirection"><option value="all"'+(opts.direction==="all"?' selected':'')+'>Minhas e recebidas</option>'+
        '<option value="enviadas"'+(opts.direction==="enviadas"?' selected':'')+'>Apenas minhas</option>'+
        '<option value="recebidas"'+(opts.direction==="recebidas"?' selected':'')+'>Apenas recebidas</option></select></label>'+
      '<label>Material para itens sem título (opcional)<input type="text" id="tgReportMaterial" maxlength="65" placeholder="Ex.: Prafesty" value="'+esc(opts.material)+'"></label>'+ 
      '</div><div class="tg-report-actions"><button type="button" class="btn btn-soft" id="tgReportPreviewBtn">Visualizar TXT</button>'+
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
  function status(message,error=false){
    const el=$("tgReportStatus");
    if(el){el.textContent=message;el.classList.toggle("error",error);}
  }
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
      if(!count)throw new Error("Não há mensagens sincronizadas para este chat a partir da data escolhida. Confira o período ou sincronize o grupo.");
      if(!result.summary.uniqueCIs)throw new Error("Nenhum CI encontrado nas mensagens deste período. Confira o filtro ou sincronize novamente.");
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
  window.TelegramReports={panelHtml,generate,parseProducts,classify,getRecords};
})();