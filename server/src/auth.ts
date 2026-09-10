import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const tenantId=process.env.TENANT_ID;
const audience=process.env.APPLICATION_ID_URI || process.env.CLIENT_ID;
const development=process.env.AUTH_MODE === "development";
const jwks=tenantId ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)) : undefined;

export async function requireApiAuth(req:Request,res:Response,next:NextFunction){
  if(development){ next(); return; }
  const token=req.header("authorization")?.replace(/^Bearer\s+/i,"");
  if(!token || !tenantId || !audience || !jwks){ res.status(401).json({error:"Missing or incomplete Entra authentication configuration."}); return; }
  try{
    const {payload}=await jwtVerify(token,jwks,{issuer:`https://login.microsoftonline.com/${tenantId}/v2.0`,audience});
    (req as Request & {auth?:unknown}).auth=payload;
    next();
  }catch{ res.status(401).json({error:"Invalid Microsoft Entra token."}); }
}
