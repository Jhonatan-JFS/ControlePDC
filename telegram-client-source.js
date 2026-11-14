/* Browser MTProto bridge. Built from teleproto on GitHub Actions.
 * No credentials, sessions or group data are embedded in this file. */
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { Api } from "teleproto";

(() => {
  "use strict";
  let client=null;
  let ownId="";
  const peers=new Map();
  function ensure(){
    if(!client)throw new Error("Conecte sua conta Telegram primeiro.");
    return client;
  }
  async function connect(options){
    const apiId=Number(options.apiId);
    if(!Number.isInteger(apiId)||apiId<=0||!options.apiHash)throw new Error("Informe API ID e API hash válidos.");
    if(client){try{await client.disconnect();}catch(_){}}
    peers.clear();
    const session=new StringSession(options.session||"");
    client=new TelegramClient(session,apiId,options.apiHash,{connectionRetries:4});
    try{
      await client.start({
        phoneNumber: async()=>options.phone||await options.ask("phone"),
        phoneCode: async(_,info)=>await options.ask("code",info),
        password: async()=>await options.ask("password"),
        emailAddress: async()=>await options.ask("email"),
        emailVerification: async()=>await options.ask("emailCode"),
        onError: err=>{ if(options.onError)options.onError(err); }
      });
      const me=await client.getMe();
      ownId=String(me.id);
      return {session:client.session.save(),userId:ownId,name:[me.firstName,me.lastName].filter(Boolean).join(" ")||me.username||"Conta conectada"};
    }catch(err){try{await client.disconnect();}catch(_){}client=null;throw err;}
  }
  async function groups(){
    const dialogs=await ensure().getDialogs({limit:400});
    peers.clear();
    const output=[];
    for(const dialog of dialogs){
      const entity=dialog.entity;
      if(!entity || !(dialog.isGroup||dialog.isChannel))continue;
      const id=(dialog.isChannel?"channel:":"chat:")+String(entity.id);
      peers.set(id,entity);
      output.push({id,name:dialog.name||entity.title||id,isChannel:!!dialog.isChannel,isGroup:!!dialog.isGroup,isForum:!!entity.forum});
    }
    return output;
  }
  function peer(groupId){
    const entity=peers.get(String(groupId));
    if(!entity)throw new Error("Grupo não carregado. Atualize a lista de grupos após conectar.");
    return entity;
  }
  async function topics(groupId){
    const entity=peer(groupId);
    if(!entity.forum)return [];
    const tg=ensure(), input=await tg.getInputEntity(entity);
    const result=[],seen=new Set();
    let offsetDate=0,offsetId=0,offsetTopic=0;
    for(let p=0;p<12;p++){
      const response=await tg.invoke(new Api.messages.GetForumTopics({
        peer:input,offsetDate,offsetId,offsetTopic,limit:100
      }));
      const batch=response?.topics||[];
      for(const t of batch){
        const topicId=Number(t.id);
        if(!Number.isInteger(topicId)||seen.has(topicId)||!t.title)continue;
        seen.add(topicId);
        result.push({id:String(topicId),name:String(t.title),closed:!!t.closed,hidden:!!t.hidden});
      }
      if(!batch.length||result.length>=Number(response.count||0)||batch.length<100)break;
      const last=batch[batch.length-1];
      const top=Number(last.topMessage||0);
      const anchor=(response.messages||[]).find(m=>Number(m.id)===top);
      const timestamp=anchor?.date ?? last.date;
      const date=timestamp instanceof Date?Math.floor(timestamp.getTime()/1000):Number(timestamp||0);
      const nextTopic=Number(last.id)||0;
      if(!nextTopic || (offsetTopic===nextTopic&&offsetId===top))break;
      offsetDate=date;offsetId=top;offsetTopic=nextTopic;
    }
    if(!seen.has(1))result.unshift({id:"1",name:"Geral",closed:false,hidden:false});
    return result;
  }
  function topicOf(message){
    const reply=message?.replyTo;
    if(!reply)return "1";
    if(reply.replyToTopId!=null)return String(reply.replyToTopId);
    if(reply.forumTopic && reply.replyToMsgId!=null)return String(reply.replyToMsgId);
    return "1";
  }
  function normalize(message){
    const results=message?.reactions?.results||[];
    const reactions=results.map(x=>({emoji:x.reaction?.emoticon||((x.reaction?.documentId)?"Emoji personalizado":"Reação"),count:Number(x.count||0)})).filter(x=>x.count>0);
    return {id:Number(message.id),senderId:String(message.senderId||""),date:message.date instanceof Date?message.date.toISOString():new Date(Number(message.date||0)*1000).toISOString(),text:String(message.message||""),out:!!message.out,edited:!!message.editDate,topicId:topicOf(message), reactions, reactionCount:reactions.reduce((sum,x)=>sum+x.count,0)};
  }
  async function scan(groupId,lastId=0,limit=1800,topicId=null){
    const tg=ensure(),entity=peer(groupId),old=Number(lastId)||0;
    const requested=topicId==null?null:String(topicId);
    const thread=requested && requested!=="1"?Number(requested):null;
    if(thread!==null && (!Number.isInteger(thread)||thread<2))throw new Error("ID de tópico inválido.");
    const params=thread!==null?{replyTo:thread}:{};
    let messages=[];
    let max=old;
    if(!old){
      const initial=await tg.getMessages(entity,{...params,limit:Math.min(200,limit)});
      messages=initial.filter(Boolean).map(normalize).filter(m=>requested==null|| (thread!==null?true:m.topicId==="1")).sort((a,b)=>a.id-b.id);
      if(thread!==null)messages.forEach(m=>{m.topicId=requested;});
      for(const m of messages)max=Math.max(max,m.id);
    } else {
      for await(const m of tg.iterMessages(entity,{...params,minId:old,reverse:true,limit})){
        if(!m)continue;
        const item=normalize(m);
        max=Math.max(max,Number(m.id));
        if(requested!=null && thread===null && item.topicId!=="1")continue;
        if(thread!==null)item.topicId=requested;
        messages.push(item);
      }
    }
    return {messages,lastId:max,truncated:old>0&&messages.length>=limit,initial:!old,ownId};
  }
  async function reactions(groupId,ids){
    const tg=ensure(),entity=peer(groupId),output=[];
    const wanted=[...new Set(ids.map(Number).filter(n=>Number.isInteger(n)&&n>0))];
    for(let index=0;index<wanted.length;index+=60){
      const batch=wanted.slice(index,index+60);
      const loaded=await tg.getMessages(entity,{ids:batch});
      const byId=new Map(loaded.filter(Boolean).map(m=>[Number(m.id),normalize(m)]));
      // Message history may carry abbreviated reaction counters. Fetch full updates when possible.
      try {
        const response=await tg.invoke(new Api.messages.GetMessagesReactions({peer:await tg.getInputEntity(entity),id:batch}));
        for(const update of (response?.updates||[])){
          if(update?.msgId==null || !update?.reactions)continue;
          const current=byId.get(Number(update.msgId));
          if(!current)continue;
          const rr=(update.reactions.results||[]).map(x=>({emoji:x.reaction?.emoticon||"Emoji personalizado",count:Number(x.count||0)})).filter(x=>x.count>0);
          current.reactions=rr;current.reactionCount=rr.reduce((a,x)=>a+x.count,0);
        }
      }catch(_){/* Reading fresh messages remains a fallback when full reaction query is unavailable. */}
      for(const id of batch)output.push(byId.has(id)?byId.get(id):{id,missing:true});
    }
    return output;
  }
  async function send(groupId,text,topicId=null){
    if(!String(text||"").trim())throw new Error("Mensagem vazia.");
    const entity=peer(groupId);
    const number=topicId==null?null:Number(topicId);
    if(entity.forum && number===null)throw new Error("Selecione um tópico antes de enviar ao grupo com tópicos.");
    if(number!==null && (!Number.isInteger(number)||number<1))throw new Error("Tópico inválido.");
    const args={message:text,parseMode:undefined};
    // O tópico Geral (1) é o destino padrão; outros exigem replyTo com ID do tópico.
    if(number!==null && number!==1)args.replyTo=number;
    const result=await ensure().sendMessage(entity,args);
    return {id:Number(result.id),topicId:number===null?null:String(number),date:new Date().toISOString()};
  }
  async function disconnect(){
    if(client)try{await client.disconnect();}finally{client=null;ownId="";peers.clear();}
  }
  window.TelegramBridge={connect,groups,topics,scan,reactions,send,disconnect,getMeId:()=>ownId,connected:()=>!!client};
})();