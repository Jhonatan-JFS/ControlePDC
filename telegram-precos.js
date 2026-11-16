/* Destaque de preços por CI no Monitoramento.
 * A fonte é somente o histórico sincronizado do Telegram (não o Solidcon). */
(() => {
  "use strict";
  const cash=s=>{
    const raw=String(s??"").trim().replace(/^R\$\s*/i,"");
    if(!/^\d[\d.,]*[.,]\d{2}$/.test(raw))return null;
    const value=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);
    return Number.isFinite(value)&&value>=0?Math.round(value*100)/100:null;
  };
  const show=v=>v==null?"":v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  function movement(s){
    if(/\b(?:ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU|QUEDA)\b/i.test(s))return "down";
    if(/\b(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU)\b/i.test(s))return "up";
    return "";
  }
  const priceLine=line=>{
    const match=String(line||"").match(/^\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})\s*$/i);
    return match?cash(match[1]):null;
  };
  const labeled=line=>{
    const old=String(line||"").match(/\b(?:de|antes|anterior|valor\s+anterior|preço\s+anterior)\s*[:=]\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})/i);
    const next=String(line||"").match(/\b(?:para|atual|novo\s+valor|preço\s+atual)\s*[:=]\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})/i);
    return {before:old?cash(old[1]):null,after:next?cash(next[1]):null};
  };
  function parseRecord(record){
    const text=String(record?.text||"");
    const lines=text.split(/\r?\n/),items=[];
    const globalMove=movement(text);
    let current=null,groupMove="";
    for(const raw of lines){
      const line=raw.trim();
      if(!line)continue;
      const flag=movement(line);
      if(/^(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s*[:!.\-]?\s*$/i.test(line)||
        /^(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s*[:–-]\s*\D/i.test(line)||
        /^.+\s*[-–:]\s*(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s*$/i.test(line)){
        groupMove=flag;current=null;continue;
      }
      const code=line.match(/^(?:CI\s*[:=#-]?\s*)?(\d{1,16})(?:\s*[-–]\s*|\s+)(\S.*)$/i);
      if(code){
        let name=code[2].trim(),before=null,after=null;
        const actionMatch=name.match(/^(?:(.*?)\s*[-–]\s*)?(AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s+(?:PARA|PRA|P\/)\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})\s*$/i)
          ||name.match(/^(.*?)\s+(AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s+(?:PARA|PRA|P\/)\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})\s*$/i);
        const lineMove=actionMatch?movement(actionMatch[2]):"";
        if(actionMatch){name=(actionMatch[1]||"").trim();after=cash(actionMatch[3]);}
        const onlyPrice=actionMatch?null:priceLine(name);
        if(onlyPrice!==null){after=onlyPrice;name="";}
        else{
          const pair=labeled(name);
          before=pair.before;after=pair.after;
          if(before!==null||after!==null){
            name=name.replace(/\s*[-–]?\s*(?:de|antes|anterior|valor\s+anterior|preço\s+anterior|para|atual|novo\s+valor|preço\s+atual)\s*[:=]\s*(?:R\$\s*)?\d[\d.,]*[.,]\d{2}/gi," ").replace(/[-–\/\s]+$/,"").trim();
          }else{
            const tail=name.match(/\s+[-–]\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})\s*$/i);
            if(tail){after=cash(tail[1]);name=name.slice(0,tail.index).trim();}
          }
        }
        const local=movement(name);
        if(local)name=name.replace(/\s*[-–]\s*(?:AUMENTOU|AUMENTO|SUBIU|REAJUSTOU|ABAIXOU|BAIXOU|DIMINUIU|REDUZIU|CAIU)\s*$/i,"").trim();
        current={ci:code[1],name,cb:"",before,after,movement:lineMove||local||groupMove||globalMove};
        items.push(current);continue;
      }
      if(!current)continue;
      const barcode=line.match(/^(?:CB|C[OÓ]DIGO\s+DE\s+BARRAS)\s*[:=-]\s*(\S+)/i);
      if(barcode){current.cb=barcode[1];continue;}
      const pair=labeled(line);
      if(pair.before!==null)current.before=pair.before;
      if(pair.after!==null)current.after=pair.after;
      const old=line.match(/^(?:de|antes|anterior|valor\s+anterior|preço\s+anterior)\s*[:=]\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})\s*$/i);
      if(old){current.before=cash(old[1]);continue;}
      const updated=line.match(/^(?:para|atual|novo\s+valor|valor\s+de\s+venda|venda|preço(?:\s+de\s+venda)?)\s*[:=]\s*(?:R\$\s*)?(\d[\d.,]*[.,]\d{2})\s*$/i);
      if(updated){current.after=cash(updated[1]);continue;}
      const standalone=priceLine(line);
      if(standalone!==null){current.after=standalone;continue;}
      if(flag)current.movement=flag;
    }
    return items;
  }
  const lookupKey=(record,ci)=>[record.telegramId||"",record.topicId??"principal",ci].join("\u001f");
  function buildIndex(all){
    const data=(all||[]).filter(r=>r.kind==="preco").slice().sort((a,b)=>
      (new Date(a.date).getTime()||0)-(new Date(b.date).getTime()||0)||
      (Number(a.messageId)||0)-(Number(b.messageId)||0));
    const last=new Map(),index=new Map();
    for(const record of data){
      const products=[];
      for(const item of parseRecord(record)){
        const key=lookupKey(record,item.ci),prior=last.get(key);
        const before=item.before??prior?.value??null;
        const after=item.after;
        let state=item.movement;
        if(!state&&before!==null&&after!==null&&before!==after)state=after>before?"up":"down";
        const mismatch=!!item.movement&&before!==null&&after!==null&&before!==after &&
          (after>before?"up":"down")!==item.movement;
        products.push({...item,before,after,state,mismatch,
          origin:item.before!==null?"message":prior?"previous":"none"});
        if(after!==null)last.set(key,{value:after,at:record.date});
      }
      index.set(String(record.telegramId||"")+":"+String(record.messageId),products);
    }
    return index;
  }
  window.TelegramPriceView={parseRecord,buildIndex,show,movement};
})();