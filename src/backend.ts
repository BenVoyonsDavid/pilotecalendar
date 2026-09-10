import { authentication } from "@microsoft/teams-js";
import type { AppState } from "./types";

async function authHeaders():Promise<Record<string,string>>{
  try{ const token=await authentication.getAuthToken(); return {Authorization:`Bearer ${token}`}; }catch{return {};}
}
export async function loadServerState():Promise<AppState|undefined>{ try{ const res=await fetch("/api/state",{headers:await authHeaders()}); if(res.status===204)return undefined; if(!res.ok)throw new Error(String(res.status)); return await res.json() as AppState; }catch{return undefined;} }
export async function saveServerState(state:AppState):Promise<boolean>{ try{ const res=await fetch("/api/state",{method:"PUT",headers:{"Content-Type":"application/json",...(await authHeaders())},body:JSON.stringify(state)}); return res.ok; }catch{return false;} }
export async function bindTeam(teamId:string,microsoftTeamId:string,microsoftChannelId?:string,microsoftChannelName?:string){ const res=await fetch(`/api/teams/${encodeURIComponent(teamId)}/bind`,{method:"POST",headers:{"Content-Type":"application/json",...(await authHeaders())},body:JSON.stringify({microsoftTeamId,microsoftChannelId,microsoftChannelName})}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`); return data; }
export async function sendBriefNow(teamId:string,dateKey:string){ const res=await fetch(`/api/notifications/${encodeURIComponent(teamId)}/send-now`,{method:"POST",headers:{"Content-Type":"application/json",...(await authHeaders())},body:JSON.stringify({dateKey})}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`); return data as {ok:boolean;text:string}; }
