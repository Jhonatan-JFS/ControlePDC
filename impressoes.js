(function printingModule(){
"use strict";
const root=document.getElementById("printingPage");if(!root)return;
const patterns="212222,222122,222221,121223,121322,131222,122213,122312,132212,221213,221312,231212,112232,122132,122231,113222,123122,123221,223211,221132,221231,213212,223112,312131,311222,321122,321221,312212,322112,322211,212123,212321,232121,111323,131123,131321,112313,132113,132311,211313,231113,231311,112133,112331,132131,113123,113321,133121,313121,211331,231131,213113,213311,213131,311123,311321,331121,312113,312311,332111,314111,221411,431111,111224,111422,121124,121421,141122,141221,112214,112412,122114,122411,142112,142211,241211,221114,413111,241112,134111,111242,121142,121241,114212,124112,124211,411212,421112,421211,212141,214121,412121,111143,111341,131141,114113,114311,411113,411311,113141,114131,311141,411131,211412,211214,211232,2331112".split(",");
const validCB=s=>/^\d{1,24}$/.test(s);
function encode(s){if(!validCB(s))throw Error("CB inválido");let a=[105];let n=s.length-(s.length%2);for(let i=0;i<n;i+=2)a.push(Number(s.slice(i,i+2)));if(n<s.length)a.push(100,s.charCodeAt(n)-32);let k=a[0];for(let i=1;i<a.length;i++)k+=i*a[i];a.push(k%103,106);return a;}
function bars(s,x,y,w,h){const p=encode(s).map(i=>patterns[i]);const total=p.join("").split("").reduce((a,b)=>a+Number(b),20);const scale=w/total;let pos=10;let out="";for(const pattern of p){[...pattern].forEach((n,i)=>{if(i%2===0)out+=`<rect x="${(x+pos*scale).toFixed(4)}" y="${y}" width="${(Number(n)*scale).toFixed(4)}" height="${h}"/>`;pos+=Number(n);});}return out;}
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=s=>{s=String(s).trim();if(!s)return "";if(!/^\d{1,6}([.,]\d{1,2})?$/.test(s))return null;return Number(s.replace(",",".")).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});};
const blank=()=>({name:"",ci:"",cb:"",price:""});
let type="gondola",rows=[],doubleGap=0;
const normalizeGap=value=>{const n=Number(String(value).replace(",","."));return Number.isFinite(n)?Math.round(Math.min(50,Math.max(0,n))*10)/10:0;};
const paperWidth=()=>types[type].w+(type==="double"?doubleGap:0);
const mmText=n=>Number(n).toLocaleString("pt-BR",{maximumFractionDigits:1});
const types={gondola:{name:"Gôndola",w:100,sides:1},label:{name:"Etiqueta",w:50,sides:1},double:{name:"Etiqueta dupla",w:100,sides:2}};
const make=()=>({parts:Array.from({length:types[type].sides},blank),qty:1,selected:true});
rows.push(make());
const style=document.createElement("style");style.textContent=`
@media(min-width:761px){.topbar .pdc-nav{grid-template-columns:repeat(5,minmax(0,1fr))}.topbar .pdc-nav button{white-space:normal;text-align:center}}
#printingPage[hidden]{display:none!important}
#printingPage .pr-head,#printingPage .pr-panel,#printingPage .pr-row{background:#131e2a;border:1px solid #364b60;border-radius:14px;padding:16px;margin-bottom:12px}
#printingPage .pr-head h2{margin:6px 0;color:#eef6ff;font-size:22px}
#printingPage p,#printingPage small{color:#a6bcd1}
#printingPage .pr-layout{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr);gap:14px;align-items:start}
#printingPage .pr-types{display:grid;gap:8px}
#printingPage .pr-types button{text-align:left;padding:12px;border:1px solid #405b74;border-radius:9px;background:#17283a;color:#e4f0ff;cursor:pointer}
#printingPage .pr-types button[aria-pressed=true]{background:#244b70;border-color:#77b8e6}
#printingPage .pr-types small{display:block;margin-top:3px}
#printingPage .pr-toolbar,#printingPage .pr-row-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
#printingPage .pr-row-head strong{margin-right:auto}
#printingPage .pr-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 12px}
#printingPage .pr-fields label:first-child{grid-column:1/-1}
#printingPage label{display:grid;gap:4px;color:#c2d4e5;font-size:12px}
#printingPage input:not([type=checkbox]){width:100%;min-width:0;background:#101d2b;color:#ecf5ff;border:1px solid #40586f;border-radius:8px;padding:9px;box-sizing:border-box}
#printingPage input[type=checkbox]{width:16px;height:16px}
#printingPage .pr-check{display:flex;align-items:center}
#printingPage .pr-qty{display:flex;align-items:center;max-width:115px}
#printingPage .pr-preview{background:#0b121a;padding:14px;border:1px solid #2b4054;border-radius:9px;overflow:auto}
#printingPage .pr-preview svg{display:block;width:100%;max-width:460px;height:auto;margin:auto;background:#fff}
#printingPage .pr-preview[data-type=label] svg{max-width:250px}
#printingPage .pr-note{display:block;margin:8px 0}
#printingPage .pr-gap[hidden]{display:none!important}
#printingPage .pr-gap{border:1px solid #40586f;border-radius:10px;padding:12px;margin:0 0 14px;background:#101d2b}
#printingPage .pr-gap-controls{display:flex;align-items:end;flex-wrap:wrap;gap:8px;margin-top:8px}
#printingPage .pr-gap-controls label{max-width:165px}
#printingPage .pr-gap-controls button[aria-pressed=true]{background:#244b70;border-color:#77b8e6;color:white}
#printingPage #prGapTotal{display:block;margin-top:9px;color:#d9ecff}
#printingPage .pr-error{color:#ffb6a7!important;white-space:pre-line}
#printingPage .pr-side{padding:8px 0}
#printingPage .pr-side+.pr-side{border-top:1px solid #40586f}
@media(max-width:760px){#printingPage .pr-layout{grid-template-columns:1fr}#printingPage .pr-types{grid-template-columns:repeat(3,minmax(0,1fr))}#printingPage .pr-types button{padding:8px;font-size:11px}}
@media(max-width:440px){#printingPage .pr-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;document.head.append(style);
root.innerHTML=`<div class="pr-head"><span class="page-eyebrow">05 / IMPRESSÕES PERSONALIZADAS</span><h2>Impressões personalizadas</h2><p>Crie gôndolas e etiquetas com código de barras, referência e preço.</p></div><div class="pr-layout"><aside class="pr-panel"><h3>Modelos de impressão</h3><div class="pr-types" id="prTypes"></div></aside><div class="pr-panel"><div class="pr-toolbar"><button type="button" class="btn btn-soft" data-pr-action="add">+ Adicionar item</button><button type="button" class="btn btn-ghost" data-pr-action="clear">Limpar lote</button><button type="button" class="btn btn-primary" data-pr-action="print">Imprimir selecionados</button></div><section id="prGapPanel" class="pr-gap" hidden aria-label="Configuração da etiqueta dupla"><strong>Espaçador entre etiquetas</strong><small style="display:block">Cada lado mantém 50 × 30 mm. O espaço central é real na impressão.</small><div class="pr-gap-controls"><label>Espaço (mm)<input id="prGapInput" type="number" min="0" max="50" step="0.1" inputmode="decimal" value="0"></label><div class="pr-gap-controls" aria-label="Espaçamentos rápidos"><button type="button" class="btn btn-soft btn-small" data-pr-gap="0" aria-pressed="true">0 mm</button><button type="button" class="btn btn-soft btn-small" data-pr-gap="1" aria-pressed="false">1 mm</button><button type="button" class="btn btn-soft btn-small" data-pr-gap="2" aria-pressed="false">2 mm</button><button type="button" class="btn btn-soft btn-small" data-pr-gap="3" aria-pressed="false">3 mm</button><button type="button" class="btn btn-soft btn-small" data-pr-gap="5" aria-pressed="false">5 mm</button></div></div><output id="prGapTotal" aria-live="polite"></output></section><p class="pr-note" id="prCount"></p><div id="prRows"></div><p id="prStatus" class="pr-error" role="status" aria-live="polite"></p><small>Na impressão, escolha a impressora térmica, o papel correspondente ao modelo, escala 100%, margens zero e desative cabeçalhos e rodapés. Os rascunhos permanecem nesta aba durante a sessão.</small></div></div>`;
const $=id=>document.getElementById(id);
const labelText=(s,x,y,size,max,anchor="start",fill="#000",weight=700)=>{const stretch=[...s].length*size*.60>max?` textLength="${max}" lengthAdjust="spacingAndGlyphs"`:"";return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-weight="${weight}" font-size="${size}" text-anchor="${anchor}" fill="${fill}"${stretch}>${esc(s)}</text>`;};
function splitName(name,limit){const s=name.trim().replace(/\s+/g," ");if(s.length<=limit)return [s];let i=s.lastIndexOf(" ",limit);if(i<limit/2)i=limit;return [s.slice(0,i),s.slice(i).trim()];}
function renderPart(p,w,x){
const small=w===500, name=splitName(p.name||"Nome do produto",small?26:52), price=money(p.price)||"";
let s='<g transform="translate('+x+' 0)">';
if(small){
name.forEach((n,i)=>s+=labelText(n,250,34+i*34,31,476,"middle"));
const by=76,bh=price?105:150;
if(validCB(p.cb)){s+=bars(p.cb,30,by,440,bh);s+=labelText(p.cb,250,by+bh+25,24,460,"middle","#000",400);}
else s+=labelText("Informe o CB",250,by+50,24,460,"middle","#555",400);
if(price)s+=labelText(price,250,279,48,470,"middle","#000",800);
}else{
name.forEach((n,i)=>s+=labelText(n,14,38+i*39,38,972));
const refWidth=p.ci?240:0, bw=price?330:Math.min(960,970-refWidth), by=103,bh=125;
if(validCB(p.cb)){s+=bars(p.cb,10,by,bw,bh);s+=labelText(p.cb,10+bw/2,by+bh+27,26,bw-8,"middle","#000",400);}
else s+=labelText("Informe o CB",10+bw/2,by+60,26,bw-8,"middle","#555",400);
if(price){const px=350,pw=p.ci?390:630;s+='<rect x="'+px+'" y="'+by+'" width="'+pw+'" height="154" fill="#000"/>';s+=labelText(price,px+pw/2,by+113,99,pw-24,"middle","#fff",800);}
if(p.ci)s+=labelText("REF:"+p.ci,986,145,30,228,"end");
}
return s+"</g>";}
function svg(row){const t=types[type],width=paperWidth(),w=Math.round(width*10),sideW=t.w*10/t.sides,gap=type==="double"?Math.round(doubleGap*10):0;let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 300" width="${width}mm" height="30mm" role="img" aria-label="Prévia da impressão"><rect width="${w}" height="300" fill="white"/>`;row.parts.forEach((p,i)=>s+=renderPart(p,sideW,i*(sideW+gap)));if(t.sides===2){if(gap>0)s+=`<rect x="500" width="${gap}" height="300" fill="#b5bec9" class="pr-separator"/><path d="M500 0V300 M${500+gap} 0V300" stroke="#888" stroke-width="1" stroke-dasharray="5 5" class="pr-separator"/>`;else s+='<path d="M500 0V300" stroke="#aaa" stroke-width="1" stroke-dasharray="5 5" class="pr-separator"/>';}return s+"</svg>";}
function updateGapUI(syncInput=true){$("prGapPanel").hidden=type!=="double";if(type!=="double")return;if(syncInput)$("prGapInput").value=doubleGap;$("prGapTotal").textContent="50 + "+mmText(doubleGap)+" + 50 = "+mmText(paperWidth())+" mm de largura total × 30 mm de altura";root.querySelectorAll("[data-pr-gap]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.prGap)===doubleGap))); }
function setGap(value,syncInput=true){doubleGap=normalizeGap(value);updateGapUI(syncInput);rows.forEach((r,i)=>{$("prPreview"+i).innerHTML=svg(r);});status("");}
function field(p,key,title,idx,side,placeholder,max,mode="text"){return `<label>${title}<input data-pr-field="${key}" data-row="${idx}" data-side="${side}" inputmode="${mode}" maxlength="${max}" value="${esc(p[key])}" placeholder="${placeholder}" autocomplete="off"></label>`;}
function refreshCount(){const selected=rows.filter(r=>r.selected);$("prCount").textContent=`${rows.length} item(ns) · ${selected.length} selecionado(s) · ${selected.reduce((n,r)=>n+r.qty,0)} impressão(ões) selecionada(s)`;}
function render(){ updateGapUI(); $("prTypes").innerHTML=Object.entries(types).map(([k,t])=>`<button type="button" data-pr-type="${k}" aria-pressed="${type===k}">${t.name}<small>${k==="double"?"2 × 50 × 30 mm":t.w+" × 30 mm"}</small></button>`).join("");$("prRows").innerHTML=rows.map((r,i)=>`<article class="pr-row"><div class="pr-row-head"><label class="pr-check"><input type="checkbox" data-pr-select="${i}" ${r.selected?"checked":""}> Selecionar</label><strong>Item ${i+1}</strong><label class="pr-qty">Qtd. <input type="number" min="1" max="200" value="${r.qty}" data-pr-qty="${i}"></label><button class="btn btn-ghost btn-small" type="button" data-pr-copy="${i}">Duplicar</button><button class="btn btn-ghost btn-small" type="button" data-pr-remove="${i}">Excluir</button></div>${r.parts.map((p,j)=>`<div class="pr-side">${type==="double"?`<strong>Lado ${j===0?"esquerdo":"direito"}</strong>`:""}<div class="pr-fields">${field(p,"name","Nome do produto",i,j,"Descrição",90)}${(type==="gondola"?field(p,"ci","CI / REF",i,j,"000000",24,"numeric"):"")}${field(p,"cb","Código de barras (CB)",i,j,"0000000000000",24,"numeric")}${field(p,"price","Valor (R$)",i,j,"9,90",9,"decimal")}</div></div>`).join("")}<div class="pr-preview" data-type="${type}" id="prPreview${i}">${svg(r)}</div></article>`).join("");refreshCount();}
function status(s){$("prStatus").textContent=s;}
function print(){const chosen=rows.filter(r=>r.selected);if(!chosen.length)return status("Selecione ao menos um item.");const issues=[];chosen.forEach(r=>{const i=rows.indexOf(r)+1;r.parts.forEach((p,j)=>{const prefix=`Item ${i}${type==="double"?" / lado "+(j+1):""}: `;if(!p.name.trim())issues.push(prefix+"informe o nome.");if(!validCB(p.cb))issues.push(prefix+"informe um CB numérico de 1 a 24 dígitos.");if(money(p.price)===null)issues.push(prefix+"valor inválido.");if(validCB(p.cb)){const mods=encode(p.cb).map(k=>patterns[k]).join("").split("").reduce((a,b)=>a+Number(b),20);const w=types[type].w/types[type].sides;const avail=w===50?44:(p.price?33:Math.min(96,97-(p.ci?24:0)));if(avail/mods<0.19)issues.push(prefix+"CB longo para este espaço; use o editor livre para ampliar as barras ou retire o valor da gôndola.");}});});const total=chosen.reduce((n,r)=>n+r.qty,0);if(total>500)issues.push("Limite de 500 impressões por lote.");if(issues.length)return status(issues.join("\n"));status("");const width=paperWidth();const f=document.createElement("iframe");f.title="Impressão de etiquetas";f.style.cssText="position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0";document.body.append(f);const pages=chosen.flatMap(r=>Array.from({length:r.qty},()=>`<div class="sheet">${svg(r)}</div>`)).join("");const d=f.contentDocument;d.open();d.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Impressões personalizadas</title><style>@page{size:${width}mm 30mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white}.sheet{width:${width}mm;height:30mm;overflow:hidden;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet svg{display:block;width:100%;height:100%}.pr-separator{display:none}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${pages}</body></html>`);d.close();const win=f.contentWindow;win.addEventListener("afterprint",()=>f.remove(),{once:true});setTimeout(()=>{try{win.focus();win.print();status("Janela de impressão solicitada. Confira a escala e o papel.");}catch(e){f.remove();status("Não foi possível abrir a impressão. Tente no navegador do computador.");}},200);}
root.addEventListener("input",e=>{const el=e.target;if(el.id==="prGapInput"){if(el.value!=="")setGap(el.value,false);return;}if(el.dataset.prField){const r=rows[Number(el.dataset.row)];r.parts[Number(el.dataset.side)][el.dataset.prField]=el.value;$("prPreview"+el.dataset.row).innerHTML=svg(r);status("");}else if(el.dataset.prQty!==undefined){rows[Number(el.dataset.prQty)].qty=Math.min(200,Math.max(1,Math.floor(Number(el.value)||1)));refreshCount();}});
root.addEventListener("change",e=>{const el=e.target;if(el.id==="prGapInput"){setGap(el.value);return;}if(el.dataset.prSelect!==undefined){rows[Number(el.dataset.prSelect)].selected=el.checked;refreshCount();}if(el.dataset.prQty!==undefined)el.value=rows[Number(el.dataset.prQty)].qty;});
const drafts=new Map();
root.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.prGap!==undefined){setGap(b.dataset.prGap);return;}const k=b.dataset.prType;if(k&&k!==type){drafts.set(type,rows);type=k;rows=drafts.get(type)||[make()];render();status("");return;}if(b.dataset.prAction==="add"){if(rows.length>=100)return status("Limite de 100 itens por modelo.");rows.push(make());render();}if(b.dataset.prAction==="clear"&&confirm("Limpar o lote deste modelo?")){rows=[make()];render();}if(b.dataset.prAction==="print")return print();if(b.dataset.prRemove!==undefined){rows.splice(Number(b.dataset.prRemove),1);if(!rows.length)rows.push(make());render();}if(b.dataset.prCopy!==undefined){if(rows.length>=100)return status("Limite de 100 itens por modelo.");const i=Number(b.dataset.prCopy);rows.splice(i+1,0,JSON.parse(JSON.stringify(rows[i])));render();}status("");});
window.PDCPrintingCore=Object.freeze({bars,encode,patterns,validCB,esc});
render();
})();
