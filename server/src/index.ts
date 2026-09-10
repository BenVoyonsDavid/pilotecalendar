import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { App, ExpressAdapter } from "@microsoft/teams.apps";
import { MessageActivityInput } from "@microsoft/teams.api";
import { requireApiAuth } from "./auth.js";
import { buildDailyBrief, localParts } from "./brief.js";
import { getState, installations, markSent, setState, upsertInstallation, wasSent } from "./store.js";
import type { AppState, TeamsInstallation } from "./serverTypes.js";

const port=Number(process.env.PORT || 3978);
const server=express();
server.use(express.json({limit:"2mb"}));
server.get("/health",(_req,res)=>res.json({status:"ok",version:"1.0.0",teamsConfigured:Boolean(process.env.CLIENT_ID && process.env.TENANT_ID)}));

const teamsApp=new App({
  httpServerAdapter:new ExpressAdapter(server),
  manifest:{ name:{short:"HoraireTeams",full:"Horaire Teams"} },
  dangerouslyAllowUnauthenticatedRequests:process.env.NODE_ENV !== "production" && process.env.TEAMS_ALLOW_UNAUTHENTICATED === "true"
});

teamsApp.on("install.add", async ({activity,send})=>{
  const raw=activity as any;
  const cd=raw.channelData;
  const install:TeamsInstallation={
    tenantId:raw.conversation?.tenantId || raw.tenant?.id || cd?.tenant?.id,
    teamId:raw.team?.aadGroupId || raw.team?.id || cd?.team?.aadGroupId || cd?.team?.id,
    channelId:raw.channel?.id || cd?.channel?.id,
    channelName:raw.channel?.name || cd?.channel?.name,
    conversationId:raw.conversation.id,
    serviceUrl:raw.serviceUrl,
    updatedAt:new Date().toISOString()
  };
  upsertInstallation(install);
  await send("HoraireTeams est prêt à envoyer les plans de journée de cette équipe.");
});

teamsApp.on("message", async ({reply})=>{ await reply("HoraireTeams est actif. Configurez les notifications dans l’onglet de l’application."); });

server.get("/api/state",requireApiAuth,(_req,res)=>{ const state=getState(); if(!state){res.status(204).end();return;} res.json(state); });
server.put("/api/state",requireApiAuth,(req,res)=>{ setState(req.body as AppState); res.json({ok:true}); });
server.get("/api/runtime",requireApiAuth,(_req,res)=>res.json({installations:installations()}));
server.post("/api/teams/:internalTeamId/bind",requireApiAuth,(req,res)=>{
  const state=getState(); if(!state){res.status(409).json({error:"No persisted state yet."});return;}
  const team=state.teams.find(t=>t.id===req.params.internalTeamId); if(!team){res.status(404).json({error:"Unknown internal team."});return;}
  const {microsoftTeamId,microsoftChannelId,microsoftChannelName}=req.body ?? {};
  team.microsoftTeamId=microsoftTeamId; team.microsoftChannelId=microsoftChannelId; team.microsoftChannelName=microsoftChannelName;
  const notification=state.notifications.find(n=>n.teamId===team.id); if(notification && microsoftChannelName) notification.channelName=microsoftChannelName;
  setState(state); res.json({ok:true,team});
});

function findConversation(state:AppState,internalTeamId:string){
  const team=state.teams.find(t=>t.id===internalTeamId); if(!team)return undefined;
  const all=installations();
  const installed=all.find(i=>team.microsoftChannelId && i.channelId===team.microsoftChannelId) || all.find(i=>team.microsoftTeamId && i.teamId===team.microsoftTeamId) || (all.length===1?all[0]:undefined);
  if (!installed) return undefined;
  return { ...installed, conversationId: team.microsoftChannelId || installed.conversationId };
}

async function sendBrief(state:AppState,internalTeamId:string,dateKey:string){
  const setting=state.notifications.find(n=>n.teamId===internalTeamId); if(!setting)throw new Error("Notification settings missing.");
  const install=findConversation(state,internalTeamId); if(!install)throw new Error("No Teams installation/conversation is linked to this team.");
  const lang=setting.language==="organization"?state.organization.language:setting.language;
  const text=buildDailyBrief(state,internalTeamId,dateKey,lang);
  await teamsApp.send(install.conversationId,new MessageActivityInput(text));
  return {conversationId:install.conversationId,text};
}

server.post("/api/notifications/:teamId/send-now",requireApiAuth,async(req,res)=>{
  try{ const state=getState(); if(!state){res.status(409).json({error:"No persisted state."});return;} const setting=state.notifications.find(n=>n.teamId===req.params.teamId); const zone=setting?.timezone || "America/Toronto"; const dateKey=String(req.body?.dateKey || localParts(new Date(),zone).dateKey); const result=await sendBrief(state,req.params.teamId,dateKey); res.json({ok:true,...result}); }
  catch(error){res.status(409).json({error:error instanceof Error?error.message:String(error)});}
});

setInterval(async()=>{
  const state=getState(); if(!state || state.organization.planId === "free")return;
  for(const setting of state.notifications.filter(n=>n.enabled)){
    const local=localParts(new Date(),setting.timezone||"America/Toronto");
    if(local.time!==setting.time || !setting.weekdays.includes(local.weekday))continue;
    const key=`${setting.teamId}|${local.dateKey}|${setting.time}`; if(wasSent(key))continue;
    try{ await sendBrief(state,setting.teamId,local.dateKey); markSent(key); console.log(`[scheduler] sent ${key}`); }
    catch(error){ console.error(`[scheduler] ${key}:`,error); }
  }
},30000);

const dist=path.resolve(process.cwd(),"dist");
if(fs.existsSync(dist)){ server.use(express.static(dist)); server.get(/^\/(?!api\/|health$).*/,(_req,res)=>res.sendFile(path.join(dist,"index.html"))); }

await teamsApp.initialize();
server.listen(port,()=>console.log(`HoraireTeams v1.0.0 backend: http://localhost:${port}`));
