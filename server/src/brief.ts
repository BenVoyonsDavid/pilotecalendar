import type { AppState, CycleType, Language } from "./serverTypes.js";

function dateKeyInZone(date:Date, zone:string) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const val=(t:string)=>parts.find(p=>p.type===t)?.value ?? "";
  return `${val("year")}-${val("month")}-${val("day")}`;
}
function localParts(date:Date, zone:string) {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:zone,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const val=(t:string)=>parts.find(p=>p.type===t)?.value ?? "";
  const dayMap:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return { weekday:dayMap[val("weekday")] ?? 0, time:`${val("hour")}:${val("minute")}`, dateKey:dateKeyInZone(date,zone) };
}
export { localParts };

function monday(date:Date){ const d=new Date(date); const day=d.getDay(); d.setHours(12,0,0,0); d.setDate(d.getDate()+(day===0?-6:1-day)); return d; }
function cycleForDate(date:Date):CycleType { const anchor=monday(new Date("2026-09-14T12:00:00")); const diff=Math.round((monday(date).getTime()-anchor.getTime())/604800000); return ((diff%2)+2)%2===0?"A":"B"; }
function inRange(key:string,start:string,end:string){ return key>=start && key<=end; }

export function buildDailyBrief(state:AppState, teamId:string, dateKey:string, language:Language) {
  const date=new Date(`${dateKey}T12:00:00`); const weekday=date.getDay(); const cycle=cycleForDate(date);
  const assignments=state.assignments.filter(a=>a.teamId===teamId && (!a.activeWeekdays || a.activeWeekdays.includes(weekday)));
  const byEmployee=Object.fromEntries(state.employees.map(e=>[e.id,e]));
  const lines:string[]=[];
  const dateLabel=new Intl.DateTimeFormat(language==="fr"?"fr-CA":"en-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(date);
  lines.push(language==="fr"?`📅 Plan de la journée — ${dateLabel}`:`📅 Daily plan — ${dateLabel}`);
  lines.push(language==="fr"?`Semaine ${cycle}`:`Week ${cycle}`);
  lines.push("");
  const setting=state.notifications.find(n=>n.teamId===teamId);
  if(setting?.includeAssignments!==false){
    lines.push(language==="fr"?"🗓️ Affectations":"🗓️ Assignments");
    for(const a of assignments){
      const ex=state.exceptions.find(e=>e.assignmentId===a.id && e.date===dateKey);
      const base=state.cycleSlots.find(s=>s.assignmentId===a.id && s.weekday===weekday && s.cycle===cycle);
      const ids=ex?.employeeIds ?? base?.employeeIds ?? [];
      const note=ex?.note ?? base?.note;
      const label=language==="fr"?a.shortLabelFr:a.shortLabelEn;
      const people=ids.map(id=>byEmployee[id]?.displayName ?? id).join(", ");
      lines.push(`${label}${a.timeLabel?` (${a.timeLabel})`:""}: ${people || note || "—"}`);
    }
  }
  if(setting?.includeAvailability){
    const reqs=state.requests.filter(r=>r.status==="approved" && inRange(dateKey,r.startDate,r.endDate) && byEmployee[r.employeeId]?.teamId===teamId);
    if(reqs.length){ lines.push(""); lines.push(language==="fr"?"👥 Disponibilités":"👥 Availability"); for(const r of reqs){ const type=language==="fr"?({vacation:"Vacances",absence:"Absence",remote:"Télétravail"} as const)[r.type]:({vacation:"Vacation",absence:"Absence",remote:"Remote"} as const)[r.type]; lines.push(`${byEmployee[r.employeeId]?.displayName ?? r.employeeId}: ${type}`); } }
  }
  if(setting?.includeCoverageWarnings){
    const missing=assignments.filter(a=>{ if(a.minimumStaff<=0)return false; const ex=state.exceptions.find(e=>e.assignmentId===a.id&&e.date===dateKey); const base=state.cycleSlots.find(s=>s.assignmentId===a.id&&s.weekday===weekday&&s.cycle===cycle); return (ex?.employeeIds ?? base?.employeeIds ?? []).length<a.minimumStaff; });
    lines.push("");
    lines.push(missing.length?(language==="fr"?`⚠️ Couverture insuffisante : ${missing.map(a=>a.shortLabelFr).join(", ")}`:`⚠️ Coverage missing: ${missing.map(a=>a.shortLabelEn).join(", ")}`):(language==="fr"?"🛡️ Couverture : OK":"🛡️ Coverage: OK"));
  }
  return lines.join("\n");
}
