import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [domain, teamsAppId, clientId] = process.argv.slice(2);
if (!domain || !teamsAppId || !clientId) {
  console.error("Usage: node scripts/prepareTeamsPackage.mjs <public-domain> <teams-app-id> <client-id>");
  process.exit(1);
}
const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
const src = path.resolve("appPackage");
const out = path.resolve("release", "teams-package");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let manifest = fs.readFileSync(path.join(src, "manifest.template.json"), "utf8");
manifest = manifest
  .replaceAll("__PUBLIC_DOMAIN__", cleanDomain)
  .replaceAll("__TEAMS_APP_ID__", teamsAppId)
  .replaceAll("__CLIENT_ID__", clientId);
JSON.parse(manifest);
fs.writeFileSync(path.join(out, "manifest.json"), manifest);
for (const icon of ["color.png", "outline.png"]) fs.copyFileSync(path.join(src, icon), path.join(out, icon));
fs.mkdirSync(path.resolve("release"), { recursive: true });
const zipPath = path.resolve("release", "HoraireTeams-TeamsApp.zip");
fs.rmSync(zipPath, { force: true });
if (process.platform === "win32") {
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `Compress-Archive -Path '${out}\\*' -DestinationPath '${zipPath}' -Force`], { stdio: "inherit" });
} else {
  execFileSync("zip", ["-j", zipPath, ...["manifest.json","color.png","outline.png"].map(f=>path.join(out,f))], { stdio: "inherit" });
}
console.log(`Teams package created: ${zipPath}`);
