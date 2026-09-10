import fs from "node:fs";
import path from "node:path";
import type { AppState, RuntimeStore, TeamsInstallation } from "./serverTypes.js";

const dataDir = path.resolve(process.cwd(), "data");
const filePath = path.join(dataDir, "horaireteams.json");
const empty: RuntimeStore = { installations: [], sentKeys: [] };

function ensureDir() { fs.mkdirSync(dataDir, { recursive: true }); }

export function readStore(): RuntimeStore {
  ensureDir();
  try {
    return { ...empty, ...JSON.parse(fs.readFileSync(filePath, "utf8")) } as RuntimeStore;
  } catch { return structuredClone(empty); }
}

export function writeStore(store: RuntimeStore) {
  ensureDir();
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

export function getState(): AppState | undefined { return readStore().state; }
export function setState(state: AppState) { const store=readStore(); store.state=state; writeStore(store); }
export function upsertInstallation(value: TeamsInstallation) {
  const store=readStore();
  const key=(x:TeamsInstallation)=>`${x.teamId ?? ""}|${x.channelId ?? ""}|${x.conversationId}`;
  store.installations=[...store.installations.filter(x=>key(x)!==key(value)), value];
  writeStore(store);
}
export function installations() { return readStore().installations; }
export function wasSent(key:string) { return readStore().sentKeys.includes(key); }
export function markSent(key:string) { const store=readStore(); store.sentKeys=[...store.sentKeys.filter(k=>!k.startsWith(key.slice(0,key.lastIndexOf("|")+1))), key].slice(-500); writeStore(store); }
