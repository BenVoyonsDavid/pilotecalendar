import { app } from "@microsoft/teams-js";

export type TeamsContextInfo={
  inTeams:boolean;
  userId?:string;
  userDisplayName?:string;
  tenantId?:string;
  teamId?:string;
  teamName?:string;
  channelId?:string;
  channelName?:string;
};

export async function initializeTeams():Promise<TeamsContextInfo>{
  try{
    await app.initialize();
    const c=await app.getContext();
    return {inTeams:true,userId:c.user?.id,userDisplayName:c.user?.displayName,tenantId:c.user?.tenant?.id,teamId:c.team?.groupId || c.team?.internalId,teamName:c.team?.displayName,channelId:c.channel?.id,channelName:c.channel?.displayName};
  }catch{return {inTeams:false};}
}
