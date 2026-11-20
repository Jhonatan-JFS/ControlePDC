/* Datas dos formulários de Solicitações e Telegram.
 * Formato exibido: DD/MM/AAAA. Não altera dados históricos automaticamente. */
(() => {
  "use strict";
  function normalize(value) {
    const raw=String(value??"").trim();
    if(!raw)return "";
    let day,month,year;
    let m=raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if(m){
      day=Number(m[1]);month=Number(m[2]);
      year=Number(m[3].length===2?"20"+m[3]:m[3]);
    }else if((m=raw.match(/^(\d{2})(\d{2})(\d{4})$/))){
      day=Number(m[1]);month=Number(m[2]);year=Number(m[3]);
    }else if((m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/))){
      // Compatibilidade com datas em ISO em rascunhos importados.
      year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);
    }else return null;
    if(year<1000||year>9999||month<1||month>12||day<1||day>31)return null;
    const check=new Date(year,month-1,day,12);
    if(check.getFullYear()!==year||check.getMonth()!==month-1||check.getDate()!==day)return null;
    return String(day).padStart(2,"0")+"/"+String(month).padStart(2,"0")+"/"+String(year).padStart(4,"0");
  }
  function mask(value) {
    const raw=String(value??"");
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return normalize(raw)||raw;
    const digits=raw.replace(/\D/g,"").slice(0,8);
    if(digits.length<=2)return digits;
    if(digits.length<=4)return digits.slice(0,2)+"/"+digits.slice(2);
    return digits.slice(0,2)+"/"+digits.slice(2,4)+"/"+digits.slice(4);
  }
  function input(target) {
    if(!target||!target.hasAttribute?.("data-date-input"))return false;
    const raw=target.value||"";
    const cursor=typeof target.selectionStart==="number"?target.selectionStart:raw.length;
    const digitsBefore=raw.slice(0,cursor).replace(/\D/g,"").length;
    const formatted=mask(raw);
    if(raw!==formatted){
      target.value=formatted;
      let next=0,seen=0;
      while(next<formatted.length&&seen<digitsBefore){
        if(/\d/.test(formatted[next]))seen++;
        next++;
      }
      if(typeof target.setSelectionRange==="function"){
        try{target.setSelectionRange(next,next);}catch(_){}
      }
    }
    target.removeAttribute?.("aria-invalid");
    return true;
  }
  function blur(target) {
    if(!target||!target.hasAttribute?.("data-date-input"))return false;
    const raw=String(target.value||"").trim();
    const formatted=normalize(raw);
    if(formatted!==null)target.value=formatted;
    if(raw&&formatted===null)target.setAttribute?.("aria-invalid","true");
    else target.removeAttribute?.("aria-invalid");
    return true;
  }
  window.SolicitacaoDatas={normalize,mask,input,blur};
})();