/* Gerador de modelos da aba Telegram; replica os campos de Solicitações,
   preservando o fluxo original do Controle PDC sem integração automática. */
(() => {
 "use strict";
 const categories=[
  {name:"Cadastros",ids:["cadastro","cadastroNFe","grade"]},
  {name:"Códigos e Identificação",ids:["cb","ean"]},
  {name:"Preços e Custos",ids:["preco","verificarPreco","custo"]},
  {name:"Grades e Unidades",ids:["desmembrar"]},
  {name:"Promoções e Validades",ids:["promoEntrar","promoSair","validadeAdd","validadeRemove"]},
  {name:"Dados do Produto",ids:["nome"]}
 ];
 const catalog={
  cadastro:{name:"Cadastro de Produto",multi:true,cat:"new"},
  cadastroNFe:{name:"Cadastro com NF-e",multi:true,cat:"new"},
  grade:{name:"Cadastro em Grade",multi:true,cat:"new"},
  cb:{name:"Atualização de CB",multi:true,cat:"other"},
  ean:{name:"Adicionar CI ou CB no EAN",cat:"other"},
  preco:{name:"Ajuste de Preço",cat:"other"},
  verificarPreco:{name:"Verificação de Preço",cat:"other"},
  custo:{name:"Adicionar Valor de Custo",cat:"other"},
  desmembrar:{name:"Desmembramento em Grade",multi:true,cat:"other"},
  promoEntrar:{name:"Entrada de Promoção",multi:true,cat:"promo"},
  promoSair:{name:"Retirada de Promoção",multi:true,cat:"promo"},
  validadeAdd:{name:"Adição de Validade",multi:true,cat:"promo"},
  validadeRemove:{name:"Remoção de Validade",multi:true,cat:"promo"},
  nome:{name:"Alteração de Nomenclatura",cat:"other"}
 };
 const models=categories.flatMap(cat=>cat.ids.map(id=>({id,name:catalog[id].name,category:cat.name,multi:!!catalog[id].multi})));
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const val=s=>String(s??"").trim();
 const defaults=id=>({category:catalog[id]?.cat||"other",eanMode:"CI",unit:"Un",rows:[{}],date:"",memo:""});
 const rows=(id,d)=>catalog[id]?.multi?(d.rows||[{}]):[d];
 const code=r=>val(r.ci||r.cb);
 function formatMoney(s){
  const raw=val(s).replace(/^R\$\s*/,"").replace(/\s/g,"");
  if(!raw)return "";
  const n=Number(raw.includes(",")?raw.replace(/\./g,"").replace(",","."):raw);
  return Number.isFinite(n)&&n>=0?n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}):null;
 }
 function dateValue(s){
  const v=val(s);if(!v)return "";
  const match=v.match(/^(\d{2})(\d{2})(\d{4})$/)||v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if(!match)return null;
  const day=Number(match[1]),month=Number(match[2]),year=Number(match[3].length===2?"20"+match[3]:match[3]);
  const d=new Date(year,month-1,day);
  if(d.getDate()!==day||d.getMonth()!==month-1||d.getFullYear()!==year)return null;
  return String(day).padStart(2,"0")+"/"+String(month).padStart(2,"0")+"/"+year;
 }
 function rowMessage(id,d,r){
  const ci=val(r.ci),cb=val(r.cb),name=val(r.name),line=code(r)+(name?" - "+name:"");
  const qty=val(d.qty);
  switch(id){
   case "cadastro":return name+(cb?"\nCB: "+cb:"");
   case "grade":return line;
   case "cadastroNFe":{
    const description=val(r.name),barcode=val(r.cb),sale=val(r.sale);
    return description+(barcode?"\nCB: "+barcode:"")+(sale?"\nVenda: "+(formatMoney(sale)||sale):"");
   }
   case "cb":return line+"\nCB: "+val(r.newCB);
   case "desmembrar":return line+(qty?" - "+qty:"");
   case "promoEntrar":return line+(val(r.qty)?" - "+val(r.qty):"")+(val(r.date)?" - Até data: "+(dateValue(r.date)||r.date):"");
   case "promoSair":return line;
   case "validadeAdd":return line+(val(r.date)?" - Até data: "+(dateValue(r.date)||r.date):"");
   case "validadeRemove":return line;
   case "ean":return ci+(name?" - "+name:"")+(d.eanMode==="CB"?"\nCB: "+cb:"");
   case "nome":return "CI - "+ci+"\n\nDE:\n"+val(r.oldName)+"\n\nPARA:\n"+val(r.newName);
   case "preco":case "verificarPreco":{
    const cost=formatMoney(r.cost),sale=formatMoney(r.sale);
    const heading=(id==="verificarPreco"||(!cost&&!sale))?"Por favor, verificar o preço:":"Por favor, ajustar o preço:";
    return heading+"\nCI - "+ci+(cost&&id!=="verificarPreco"?"\nCusto: "+cost:"")+(sale&&id!=="verificarPreco"?"\nVenda: "+sale:"")+(r.memo?"\n"+r.memo:"");
   }
   case "custo":return "Por favor, adicionar o valor de custo:\nCI - "+ci+"\nCusto: "+(formatMoney(r.cost)||"");
   default:return "";
  }
 }
 function message(id,d){
  const text=rows(id,d).filter(r=>["cadastro","cadastroNFe"].includes(id)?val(r.name):code(r)).map(r=>rowMessage(id,d,r)).filter(Boolean);
  // Separação aprovada: uma linha em branco entre produtos, sem separar CI e CB.
  switch(id){
   case "cadastro":return "Por favor, cadastrar:\n"+text.join("\n\n");
   case "cadastroNFe":return "Por favor, cadastrar:\nEmpresa "+val(d.company)+"; NF-e: "+val(d.nfeNumber)+".\n"+text.join("\n\n");
   case "grade":return "Por favor, cadastrar na grade do CI "+val(d.rootCI)+" - "+val(d.rootName)+".\n"+text.join("\n\n");
   case "cb":return "Por favor, atualizar CB:\n"+text.join("\n\n");
   case "desmembrar":return "Por favor, desmembrar em "+(d.unit==="Personalizado"?val(d.customUnit):d.unit)+(val(d.qty)?" ("+val(d.qty)+")":"")+":\n"+text.join("\n────────\n");
   case "promoEntrar":return "Por favor, colocar em Promoção:\n"+text.join("\n\n");
   case "promoSair":return "Por favor, retirar a Promoção:\n"+text.join("\n\n");
   case "validadeAdd":return "Por favor, colocar em Promoção:\n"+text.join("\n\n");
   case "validadeRemove":return "Por favor, retirar a Promoção:\n"+text.join("\n\n");
   case "ean":return "Por favor, adicionar o "+(d.eanMode||"CI")+" no EAN:\n"+(text[0]||"");
   case "nome":return "Por favor, alterar nomenclatura:\n"+(text[0]||"");
   default:return text[0]||"";
  }
 }
 function validate(id,d){
  if(!catalog[id])return "Modelo desconhecido.";
  if(id==="cadastro"){
    if(!Array.isArray(d.rows)||!d.rows.length||d.rows.some(r=>!val(r.name)))return "Informe o nome de cada produto ou remova as linhas vazias.";
    return "";
  }
  if(id==="cadastroNFe"){
    if(!val(d.company))return "Informe o nome da empresa.";
    if(!val(d.nfeNumber))return "Informe o número da nota fiscal (NF-e).";
    if(!Array.isArray(d.rows)||!d.rows.length||d.rows.some(r=>!val(r.name)))return "Informe o nome de cada produto ou remova as linhas vazias.";
    if(d.rows.some(r=>val(r.sale)&&formatMoney(r.sale)===null))return "Verifique os valores de venda: use números positivos.";
    return "";
  }
  const all=rows(id,d),filled=all.filter(r=>code(r));
  if(!filled.length)return "Informe o CI ou CB de pelo menos um produto.";
  if(catalog[id].multi && all.some(r=>!code(r)))return "Complete ou remova as linhas de produtos vazias.";
  if(id==="grade"&&(!val(d.rootCI)||!val(d.rootName)))return "Informe CI principal e nome da grade.";
  if(id==="ean"&&(!val(d.ci)||!val(d.name)))return "Informe CI e nome do produto.";
  if(id==="ean"&&d.eanMode==="CB"&&!val(d.cb))return "Informe o CB a adicionar no EAN.";
  if(id==="cb"&&all.some(r=>!val(r.ci)||!val(r.newCB)))return "Informe o CI e o novo CB de cada produto.";
  if(id==="nome"&&(!val(d.ci)||!val(d.oldName)||!val(d.newName)))return "Informe CI, nome atual e novo nome.";
  for(const r of all){
    if((r.cost&&formatMoney(r.cost)===null)||(r.sale&&formatMoney(r.sale)===null))return "Verifique os valores: use números positivos.";
    if(r.date&&dateValue(r.date)===null)return "A validade deve ser uma data válida, como 27/10/2026.";
  }
  if(id==="custo"&&!val(d.cost))return "Informe o valor de custo.";
  if(id==="desmembrar"&&d.unit==="Personalizado"&&!val(d.customUnit))return "Informe a unidade personalizada.";
  return "";
 }
 function field(d,key,label,opts={}){
  return '<label class="req-field '+(opts.wide?"wide":"")+'">'+esc(label)+'<input data-tg-field="'+esc(key)+'" value="'+esc(d[key]||"")+'"'+(opts.inputmode?' inputmode="'+esc(opts.inputmode)+'"':"")+' autocomplete="off"></label>';
 }
 function rowField(d,i,key,label){
  return '<label class="req-field">'+esc(label)+'<input data-tg-row="'+i+'" data-tg-key="'+esc(key)+'" value="'+esc((d.rows||[])[i]?.[key]||"")+'" autocomplete="off"></label>';
 }
 function select(d,key,label,choices){
  return '<label class="req-field">'+esc(label)+'<select data-tg-field="'+esc(key)+'">'+choices.map(([k,name])=>'<option value="'+esc(k)+'"'+(d[key]===k?" selected":"")+'>'+esc(name)+'</option>').join("")+'</select></label>';
 }
 function form(id,d){
  const meta=catalog[id];if(!meta)return '<p class="req-warning">Modelo indisponível.</p>';
  let extras="";
  if(id==="grade")extras=field(d,"rootCI","CI principal")+field(d,"rootName","Nome da grade");
  if(id==="cadastroNFe")extras=field(d,"company","Nome da empresa",{wide:true})+field(d,"nfeNumber","Número da NF-e",{wide:true,inputmode:"numeric"});
  if(id==="desmembrar")extras=select(d,"unit","Unidade",[["Un","Un."],["Metro","Metro"],["1/2 Metro","1/2 Metro"],["Personalizado","Personalizado"]])+field(d,"qty","Quantidade (opcional)")+(d.unit==="Personalizado"?field(d,"customUnit","Nome da unidade"):"");
  if(id==="ean")extras=select(d,"eanMode","Código a adicionar no EAN",[["CI","CI"],["CB","CB"]]);
  const extra='<div class="req-fields">'+extras+'</div>';
  function rowForm(r,i){
    if(id==="cadastro"){
      return '<div class="req-product-row"><div class="req-product-head"><b>Produto '+(i+1)+'</b>'+
        (d.rows.length>1?'<button type="button" data-tg-remove-row="'+i+'" class="btn btn-link">Remover</button>':'')+
        '</div><div class="req-fields">'+rowField(d,i,"name","Nome do produto")+
        rowField(d,i,"cb","CB (opcional)")+
        '</div><div class="req-row-copy"><button type="button" data-tg-copy-row="'+i+'" class="btn btn-ghost btn-small">Copiar produto</button></div></div>';
    }
    if(id==="cadastroNFe"){
      return '<div class="req-product-row"><div class="req-product-head"><b>Produto '+(i+1)+'</b>'+
        (d.rows.length>1?'<button type="button" data-tg-remove-row="'+i+'" class="btn btn-link">Remover</button>':'')+
        '</div><div class="req-fields">'+rowField(d,i,"name","Nome do produto")+
        rowField(d,i,"cb","CB (opcional)")+
        rowField(d,i,"sale","Venda (R$) — opcional")+
        '</div><div class="req-row-copy"><button type="button" data-tg-copy-row="'+i+'" class="btn btn-ghost btn-small">Copiar produto</button></div></div>';
    }
    return '<div class="req-product-row"><div class="req-product-head"><b>Produto '+(i+1)+'</b>'+(d.rows.length>1?'<button type="button" data-tg-remove-row="'+i+'" class="btn btn-link">Remover</button>':"")+'</div><div class="req-fields">'+
       rowField(d,i,"ci","CI")+rowField(d,i,"cb","CB (opcional)")+rowField(d,i,"name","Nome do produto")+
       (id==="cb"?rowField(d,i,"newCB","Novo CB"):"")+
       (["promoEntrar","validadeAdd"].includes(id)?rowField(d,i,"date","Validade (dd/mm/aaaa)"):"")+
       (id==="promoEntrar"?rowField(d,i,"qty","Quantidade"):"")+
       '</div><div class="req-row-copy"><button type="button" data-tg-copy-row="'+i+'" class="btn btn-ghost btn-small">Copiar produto</button><button type="button" data-tg-copy-part="ci" data-tg-which="'+i+'" class="btn btn-link">CI</button><button type="button" data-tg-copy-part="cb" data-tg-which="'+i+'" class="btn btn-link">CB</button><button type="button" data-tg-copy-part="name" data-tg-which="'+i+'" class="btn btn-link">Nome</button></div></div>';
  }
  const simple=!meta.multi?'<div class="req-fields">'+field(d,"ci","CI")+(id==="ean"&&d.eanMode==="CB"?field(d,"cb","CB"):"")+
   field(d,"name",id==="ean"?"Nome do produto":"Nome do produto (referência)")+
   (id==="nome"?field(d,"oldName","Nome atual")+field(d,"newName","Novo nome"):"")+
   (id==="preco"?field(d,"cost","Custo (R$)",{inputmode:"decimal"})+field(d,"sale","Venda (R$)",{inputmode:"decimal"}):"")+
   (id==="custo"?field(d,"cost","Custo (R$)",{inputmode:"decimal"}):"")+
   '</div><div class="req-row-copy"><button type="button" data-tg-copy-part="ci" data-tg-which="0" class="btn btn-link">CI</button><button type="button" data-tg-copy-part="cb" data-tg-which="0" class="btn btn-link">CB</button><button type="button" data-tg-copy-part="name" data-tg-which="0" class="btn btn-link">Nome</button></div>':
   d.rows.map(rowForm).join("")+'<button type="button" id="tgAddRow" class="btn btn-soft btn-small req-add">＋ Adicionar produto</button>';
  const memo=["preco","verificarPreco"].includes(id)?'<label class="req-wide-note">Observação (opcional; texto livre)<textarea data-tg-field="memo" rows="2">'+esc(d.memo||"")+'</textarea></label>':"";
  return '<div class="req-form-heading"><div><small>MODELO SELECIONADO</small><h3>'+esc(meta.name)+'</h3></div><button type="button" class="btn btn-ghost btn-small" id="tgClearDraft">Limpar</button></div>'+(id==="cadastro"?'<p class="req-muted">Produto novo: informe o nome e, se houver, o CB. O CI será atribuído após o cadastro.</p>':"")+extra+simple+memo;
 }
 window.TelegramTemplates={models,categories,defaults,form,message,validate,rowMessage,formatMoney,dateValue};
})();
