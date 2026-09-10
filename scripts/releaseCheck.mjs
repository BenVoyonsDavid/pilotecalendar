import fs from "node:fs";
import path from "node:path";

const problems=[];
const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));
if(pkg.version!=="1.0.0") problems.push(`package.json version is ${pkg.version}`);
const envPath=path.resolve(".env");
if(!fs.existsSync(envPath)) problems.push(".env is missing");
else {
  const env=Object.fromEntries(fs.readFileSync(envPath,"utf8").split(/\r?\n/).filter(Boolean).filter(x=>!x.startsWith("#")).map(line=>{const i=line.indexOf("=");return i<0?[line,""]:[line.slice(0,i),line.slice(i+1)]}));
  for(const key of ["CLIENT_ID","CLIENT_SECRET","TENANT_ID","PUBLIC_DOMAIN","APPLICATION_ID_URI"]) if(!env[key] || /replace-me|00000000|example\.com/i.test(env[key])) problems.push(`${key} is not configured for production`);
  if(env.NODE_ENV!=="production") problems.push("NODE_ENV must be production");
  if(env.AUTH_MODE!=="entra") problems.push("AUTH_MODE must be entra");
  if(env.TEAMS_ALLOW_UNAUTHENTICATED==="true") problems.push("TEAMS_ALLOW_UNAUTHENTICATED must be false");
}
if(problems.length){ console.error("Release check FAILED:\n- "+problems.join("\n- ")); process.exit(1); }
console.log("Release check OK for HoraireTeams v1.0.0 production configuration.");
