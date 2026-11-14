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
  function consolidate(records){
    const map=new Map();
    for(const rec of records){
      const category=classify(rec);
      const values=parseProducts(rec.text,category);
      for(const product of values){
        if(!product.ci)continue;
        let item=map.get(product.ci);
        if(!item){item={ci:product.ci,count:0,last:rec,category,fields:{}};map.set(product.ci,item);}
        item.count++;
        item.last=rec;item.category=category;
        for(const field of ["name","cb","sale","cost"]){
          if(product[field])item.fields[field]={value:product[field],date:rec.date,messageId:rec.messageId};
        }
      }
    }
    return [...map.values()].sort((a,b)=>new Date(b.last.date)-new Date(a.last.date)||(Number(b.last.messageId)||0)-(Number(a.last.messageId)||0)||a.ci.localeCompare(b.ci));
  }
  function generate(all,opts){
    const records=getRecords(all,opts),group=opts.group;
    const topic=group.isForum?group.topics.find(t=>t.id===String(opts.topicId)):null;
    const items=consolidate(records);
    const title=group.name+(topic?" / "+topic.name:"");
    const summary={
      total:records.length,uniqueCIs:items.length,latest:items,
      sections:Object.fromEntries(sectionKeys.map(k=>[k,records.filter(r=>classify(r)===k)]))
    };
    const lines=[
      "RELATÓRIO DE MONITORAMENTO TELEGRAM",
      "============================================================",
      "Grupo: "+group.name,
      "Tópico: "+(topic?.name||"Conversa principal (sem tópicos)"),
      "A partir de: "+formatCutoff(opts.from)+" (horário local do navegador)",
      "Gerado em: "+formatDate(new Date()),
      "Filtro: "+labels[opts.kind||"all"],
      "Origem: "+(opts.direction==="enviadas"?"Minhas mensagens":opts.direction==="recebidas"?"Mensagens recebidas":"Todas as mensagens"),
      "Fonte: mensagens já sincronizadas neste navegador",
      "Mensagens no período: "+records.length,
      "CIs identificados: "+items.length,
      "============================================================",
      "",
      "1. ÚLTIMAS INFORMAÇÕES REGISTRADAS POR CI",
      "------------------------------------------------------------"
    ];
    if(!items.length)lines.push("Nenhum CI identificável encontrado neste recorte.");
    for(const p of items){
      lines.push(
        "CI: "+p.ci,
        "Produto (última descrição registrada): "+(p.fields.name?.value||"Não informado"),
        "Última mensagem registrada: "+formatDate(p.last.date)+" | ID "+p.last.messageId,
        "Título da mensagem: "+titleOf(p.last),
        "Categoria da última mensagem: "+headings[p.category],
        "Ocorrências deste CI no recorte: "+p.count
      );
      for(const [field,name] of [["cb","CB"],["sale","Venda"],["cost","Custo"]]){
        const source=p.fields[field];
        if(source)lines.push(name+" (última informação explícita): "+source.value+" | Mensagem "+source.messageId+" em "+formatDate(source.date));
      }
      lines.push("");
    }
    let n=2;
    for(const key of sectionKeys){
      const section=summary.sections[key];
      if((opts.kind||"all")!=="all"&&key!==opts.kind)continue;
      lines.push(n+". "+headings[key]+" ("+section.length+")","------------------------------------------------------------");
      if(!section.length)lines.push("Nenhuma mensagem nesta categoria.");
      // Histórico por mensagem, mais recente primeiro, preserva o texto de origem.
      for(const rec of section.slice().reverse()){
        const itemName=titleOf(rec);
        const products=parseProducts(rec.text,key);
        lines.push("["+formatDate(rec.date)+"] "+(recordDirection(rec)==="enviadas"?"ENVIADA":"RECEBIDA")+
          " | Mensagem "+rec.messageId,
          "TÍTULO: "+itemName,
          "AUTOR: "+(recordDirection(rec)==="enviadas"?"Minha conta":"Participante"+(rec.senderId?" ID "+rec.senderId:"")));
        if(key==="solicitacao")lines.push("CONFERÊNCIA: "+(rec.unavailable?"Indisponível":rec.status==="conferido"?"Conferido":rec.status==="pendente"?"Não conferido":"Não verificada"));
        if(products.length){
          for(const p of products){
            lines.push("CI: "+p.ci,"Produto: "+(p.name||"Não informado"));
            if(p.cb)lines.push("CB: "+p.cb);
            if(p.sale)lines.push("Venda: "+p.sale);
            if(p.cost)lines.push("Custo: "+p.cost);
          }
        }
        lines.push("MENSAGEM ORIGINAL:",plain(rec.text||"(sem texto)"),"------------------------------------------------------------");
      }
      lines.push("");
      n++;
    }
    lines.push("OBSERVAÇÕES:",
      "- O resumo por CI destaca a última informação explícita encontrada neste recorte, sem presumir alterações no Solidcon.",
      "- CIs e CBs são tratados como identificadores diferentes. Campos ausentes não são inventados.",
      "- O relatório utiliza somente o histórico disponível no dispositivo; para incluir mensagens novas, sincronize antes de exportar.",
      "- Mensagens apagadas antes de serem sincronizadas ou anteriores ao histórico disponível podem não estar presentes.");
    return {text:lines.join("\r\n")+"\r\n",summary,group:group.name,topic:topic?.name||"",fileName:filename(title,opts.from)};
  }
  function filename(chat,from){
    const safe=chat.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,65)||"Chat";
    const date=String(from).replace(/[^0-9]/g,"").slice(0,12);
    return "RELATORIO_TELEGRAM_"+safe+"_"+date+".txt";
  }
  let opts={from:"",kind:"all",direction:"all"};
  function panelHtml(scope){
    const g=scope?.group;
    if(!g)return '<section class="tg-report-panel"><h3>Relatório TXT por chat</h3><p>Escolha um grupo para habilitar a exportação.</p></section>';
    const topicOptions=g.isForum?
      '<label>Tópico que terá o TXT próprio<select id="tgReportTopic">'+g.topics.map(t=>
        '<option value="'+esc(t.id)+'"'+(String(scope.activeTopic==="all"?(g.topics[0]?.id||""):scope.activeTopic)===t.id?' selected':'')+'>'+esc(t.name)+'</option>'
      ).join("")+'</select></label>':"";
    const typeOptions=Object.entries(labels).map(([id,label])=>'<option value="'+id+'"'+(opts.kind===id?' selected':'')+'>'+label+'</option>').join("");
    return '<section class="tg-report-panel" aria-labelledby="tgReportHeading">'+
      '<div class="tg-report-head"><div><h3 id="tgReportHeading">Relatório TXT deste chat</h3><p>Escolha o período e exporte um arquivo organizado, com os títulos, produtos, CIs e últimas informações registradas.</p></div>'+
      '<span>Arquivo .TXT</span></div>'+
      '<div class="tg-report-fields">'+
      '<label>Iniciar a partir de (data e hora)<input type="datetime-local" id="tgReportFrom" value="'+esc(opts.from)+'"></label>'+
      topicOptions+
      '<label>Tipo de relatório<select id="tgReportKind">'+typeOptions+'</select></label>'+
      '<label>Mensagens<select id="tgReportDirection"><option value="all"'+(opts.direction==="all"?' selected':'')+'>Minhas e recebidas</option>'+
        '<option value="enviadas"'+(opts.direction==="enviadas"?' selected':'')+'>Apenas minhas</option>'+
        '<option value="recebidas"'+(opts.direction==="recebidas"?' selected':'')+'>Apenas recebidas</option></select></label>'+
      '</div><div class="tg-report-actions"><button type="button" class="btn btn-soft" id="tgReportPreviewBtn">Visualizar TXT</button>'+
      '<button type="button" class="btn btn-primary" id="tgReportDownloadBtn">Baixar relatório TXT</button></div>'+
      '<p id="tgReportStatus" class="tg-report-status" role="status" aria-live="polite">Defina o início do período. O arquivo usará o histórico já sincronizado; não buscará mensagens antigas automaticamente.</p>'+
      '<pre id="tgReportPreview" class="tg-report-preview" hidden></pre></section>';
  }
  function controlValues(){
    const scope=window.TelegramConnector?.getReportScope?.();
    if(!scope?.group)throw new Error("Selecione um grupo na aba Monitoramento.");
    return {group:scope.group,topicId:scope.group.isForum?$("tgReportTopic")?.value:null,
      from:$("tgReportFrom")?.value||"",kind:$("tgReportKind")?.value||"all",
      direction:$("tgReportDirection")?.value||"all"};
  }
  function createCurrent(){
    const values=controlValues();
    opts={from:values.from,kind:values.kind,direction:values.direction};
    return generate(window.TelegramConnector.readHistory().records,values);
  }
  function status(message,error=false){
    const el=$("tgReportStatus");
    if(el){el.textContent=message;el.classList.toggle("error",error);}
  }
  document.addEventListener("click",event=>{
    const preview=event.target.closest("#tgReportPreviewBtn");
    const download=event.target.closest("#tgReportDownloadBtn");
    if(!preview&&!download)return;
    try{
      const result=createCurrent(),count=result.summary.total;
      if(!count)throw new Error("Não há mensagens sincronizadas para este chat a partir da data escolhida. Confira o período ou sincronize o grupo.");
      if(preview){
        const target=$("tgReportPreview");
        if(target){target.hidden=false;target.textContent=result.text;}
        status(count+" mensagens encontradas e "+result.summary.uniqueCIs+" CIs identificados.");
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