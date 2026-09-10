import { useEffect, useMemo, useState } from "react";
import "./PiloteCalendarV131.css";
import { saveServerState } from "./backend";
import { addDays, dateInRange, formatLongDate, formatWeekRange, startOfWeek, toDateKey } from "./dateUtils";
import { createBlankCompanyState } from "./sampleData";
import type { AppState, AssignmentDefinition, Employee, Language, PlanId, ScheduleRequest, UserRole } from "./types";
import type { TeamsContextInfo } from "./teams";

type View = "week" | "team" | "requests" | "calendar" | "admin";
type AdminTab = "types" | "planner" | "members" | "plans";
type AccessLevel = "admin" | "employee";
type PresenceCategory = "onsite" | "remote";
type PresenceStatus = "onsite" | "remote" | "leave";

type OperationalEvent = { id: string; title: string; date: string; time?: string; minimumOnSite: number };
type CalendarConfig = { outlookCalendarUrl: string; defaultMinimumOnSite: number; events: OperationalEvent[] };
type AssignmentDraft = {
  id?: string;
  labelFr: string;
  labelEn: string;
  shortLabelFr: string;
  shortLabelEn: string;
  timeLabel: string;
  location: string;
  presenceCategory: PresenceCategory;
  minimumStaff: number;
  teamId: string;
  activeWeekdays: number[];
};

const STORAGE_KEY = "horaireTeams.v1";
const CONFIG_KEY = "pilotecalendar.v1.3.1.config";
const LEGACY_CONFIG_KEYS = ["pilotecalendar.v1.3.config", "pilotecalendar.v1.2.config", "pilotecalendar.v1.1.config"];

const WEEKDAYS = [
  { value: 1, fr: "Lun", en: "Mon" },
  { value: 2, fr: "Mar", en: "Tue" },
  { value: 3, fr: "Mer", en: "Wed" },
  { value: 4, fr: "Jeu", en: "Thu" },
  { value: 5, fr: "Ven", en: "Fri" },
];

const PLAN_INFO: Record<PlanId, { fr: string; en: string; employees: string; teams: string; featuresFr: string[]; featuresEn: string[] }> = {
  free: {
    fr: "Gratuit", en: "Free", employees: "5", teams: "1",
    featuresFr: ["Horaire hebdomadaire", "Vue Ma semaine", "Vue d’ensemble de l’équipe", "Demandes simples"],
    featuresEn: ["Weekly schedule", "My week view", "Team overview", "Basic requests"],
  },
  team: {
    fr: "Équipe", en: "Team", employees: "30", teams: "5",
    featuresFr: ["Tout le forfait Gratuit", "Approbation des demandes", "Calendrier central", "Événements et minimum présentiel", "Intégrations Microsoft 365"],
    featuresEn: ["Everything in Free", "Request approvals", "Central calendar", "Events and on-site minimum", "Microsoft 365 integrations"],
  },
  business: {
    fr: "Entreprise", en: "Business", employees: "Illimité", teams: "Illimité",
    featuresFr: ["Tout le forfait Équipe", "Employés et équipes illimités", "Administration avancée", "Permissions et intégrations avancées", "Déploiement multiéquipes"],
    featuresEn: ["Everything in Team", "Unlimited employees and teams", "Advanced administration", "Advanced permissions and integrations", "Multi-team deployment"],
  },
};

const defaultConfig: CalendarConfig = {
  outlookCalendarUrl: "https://outlook.office.com/calendar/view/week",
  defaultMinimumOnSite: 1,
  events: [],
};

function normalizeAssignment(item: AssignmentDefinition): AssignmentDefinition {
  const text = [item.id, item.labelFr, item.labelEn, item.shortLabelFr, item.shortLabelEn, item.location].filter(Boolean).join(" ").toLowerCase();
  const remote = item.category === "remote" || text.includes("erg");
  return { ...item, category: remote ? "remote" : "other" };
}

function readState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.organization?.isDemo) return { ...parsed, assignments: (parsed.assignments ?? []).map(normalizeAssignment) };
    }
  } catch {
    // Start clean below.
  }
  return createBlankCompanyState("fr", "free", "Mon organisation");
}

function normalizeConfig(value: Partial<CalendarConfig>): CalendarConfig {
  return {
    outlookCalendarUrl: value.outlookCalendarUrl || defaultConfig.outlookCalendarUrl,
    defaultMinimumOnSite: Math.max(0, Number(value.defaultMinimumOnSite ?? 1)),
    events: Array.isArray(value.events) ? value.events : [],
  };
}

function readConfig(): CalendarConfig {
  try {
    const current = localStorage.getItem(CONFIG_KEY);
    if (current) return normalizeConfig(JSON.parse(current));
    for (const key of LEGACY_CONFIG_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) return normalizeConfig(JSON.parse(legacy));
    }
  } catch {
    // Use defaults.
  }
  return defaultConfig;
}

function isAdmin(employee?: Employee) {
  return employee?.role === "owner" || employee?.role === "admin";
}

function accessLevel(role: UserRole): AccessLevel {
  return role === "owner" || role === "admin" ? "admin" : "employee";
}

function assignmentLabel(item: AssignmentDefinition, language: Language, short = false) {
  if (language === "fr") return short ? item.shortLabelFr || item.labelFr : item.labelFr;
  return short ? item.shortLabelEn || item.labelEn : item.labelEn;
}

function assignmentIsRemote(item: AssignmentDefinition) {
  return item.category === "remote";
}

function assignmentIcon(item: AssignmentDefinition) {
  return assignmentIsRemote(item) ? "🏠" : "🏢";
}

function requestLabel(request: ScheduleRequest, language: Language) {
  if (language === "fr") return request.type === "remote" ? "Télétravail" : request.type === "vacation" ? "Congé" : "Autre";
  return request.type === "remote" ? "Remote work" : request.type === "vacation" ? "Leave" : "Other";
}

function weeklySlot(state: AppState, assignmentId: string, weekday: number) {
  return state.cycleSlots.find((slot) => slot.assignmentId === assignmentId && slot.weekday === weekday);
}

function assignmentsForEmployee(state: AppState, employeeId: string, date: Date) {
  const dateKey = toDateKey(date);
  return state.assignments.filter((assignment) => {
    if (assignment.activeWeekdays?.length && !assignment.activeWeekdays.includes(date.getDay())) return false;
    const exception = state.exceptions.find((item) => item.assignmentId === assignment.id && item.date === dateKey);
    const ids = exception?.employeeIds ?? weeklySlot(state, assignment.id, date.getDay())?.employeeIds ?? [];
    return ids.includes(employeeId);
  });
}

function approvedRequests(state: AppState, employeeId: string, date: Date) {
  return state.requests.filter((request) => request.employeeId === employeeId && request.status === "approved" && dateInRange(date, request.startDate, request.endDate));
}

function presenceStatus(state: AppState, employee: Employee, date: Date): PresenceStatus {
  const requests = approvedRequests(state, employee.id, date);
  if (requests.some((request) => request.type === "vacation" || request.type === "absence")) return "leave";
  if (requests.some((request) => request.type === "remote")) return "remote";
  if (assignmentsForEmployee(state, employee.id, date).some(assignmentIsRemote)) return "remote";
  return "onsite";
}

function presenceText(status: PresenceStatus, language: Language) {
  if (language === "fr") return status === "onsite" ? "Présentiel" : status === "remote" ? "À distance" : "Absent";
  return status === "onsite" ? "On-site" : status === "remote" ? "Remote" : "Away";
}

function emptyAssignmentDraft(state: AppState): AssignmentDraft {
  return {
    labelFr: "", labelEn: "", shortLabelFr: "", shortLabelEn: "", timeLabel: "", location: "",
    presenceCategory: "onsite", minimumStaff: 0,
    teamId: state.teams.find((team) => team.active)?.id ?? state.teams[0]?.id ?? "main",
    activeWeekdays: [1, 2, 3, 4, 5],
  };
}

function draftFromAssignment(item: AssignmentDefinition): AssignmentDraft {
  return {
    id: item.id, labelFr: item.labelFr, labelEn: item.labelEn, shortLabelFr: item.shortLabelFr,
    shortLabelEn: item.shortLabelEn, timeLabel: item.timeLabel ?? "", location: item.location ?? "",
    presenceCategory: assignmentIsRemote(item) ? "remote" : "onsite", minimumStaff: item.minimumStaff,
    teamId: item.teamId, activeWeekdays: item.activeWeekdays?.length ? [...item.activeWeekdays] : [1, 2, 3, 4, 5],
  };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export default function PiloteCalendarV131({ teamsContext }: { teamsContext?: TeamsContextInfo }) {
  const [view, setView] = useState<View>("week");
  const [state, setState] = useState<AppState>(() => readState());
  const [config, setConfig] = useState<CalendarConfig>(() => readConfig());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [actingUserId, setActingUserId] = useState("");

  useEffect(() => localStorage.setItem(CONFIG_KEY, JSON.stringify(config)), [config]);

  useEffect(() => {
    const active = state.employees.filter((employee) => employee.active);
    const teamsMatch = teamsContext?.userId ? active.find((employee) => employee.microsoftUserId === teamsContext.userId) : undefined;
    if (teamsMatch) setActingUserId(teamsMatch.id);
    else if (!active.some((employee) => employee.id === actingUserId)) setActingUserId(active[0]?.id ?? "");
  }, [state.employees, teamsContext?.userId, actingUserId]);

  const language = state.organization.language;
  const actingUser = state.employees.find((employee) => employee.id === actingUserId && employee.active) ?? state.employees.find((employee) => employee.active);
  const admin = isAdmin(actingUser);
  const weekdays = useMemo(() => [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset)), [weekStart]);

  useEffect(() => {
    if (!admin && (view === "calendar" || view === "admin")) setView("week");
  }, [admin, view]);

  const persistState = (next: AppState) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    void saveServerState(next);
  };

  return <div className="pc131">
    <header className="pc131-top">
      <div className="pc131-brand"><span>📅</span><div><strong>PiloteCalendar</strong><small>v1.3.1</small></div></div>
      <nav className="pc131-nav">
        <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>📆 {language === "fr" ? "Ma semaine" : "My week"}</button>
        <button className={view === "team" ? "active" : ""} onClick={() => setView("team")}>👥 {language === "fr" ? "Équipe" : "Team"}</button>
        <button className={view === "requests" ? "active" : ""} onClick={() => setView("requests")}>📝 {language === "fr" ? "Demandes" : "Requests"}</button>
        {admin && <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>🗓️ {language === "fr" ? "Calendrier central" : "Central calendar"}</button>}
        {admin && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>⚙️ {language === "fr" ? "Administration" : "Administration"}</button>}
      </nav>
      <div className="pc131-user">
        {!teamsContext?.userId && <label>{language === "fr" ? "Utilisateur" : "User"}<select value={actingUser?.id ?? ""} onChange={(event) => setActingUserId(event.target.value)}>{state.employees.filter((employee) => employee.active).map((employee) => <option value={employee.id} key={employee.id}>{employee.displayName}</option>)}</select></label>}
        {actingUser && <span className={`pc131-access ${admin ? "admin" : "employee"}`}>{admin ? "Admin" : (language === "fr" ? "Employé" : "Employee")}</span>}
      </div>
    </header>

    {view === "week" && <WeekView state={state} config={config} weekStart={weekStart} weekdays={weekdays} employee={actingUser} onWeek={setWeekStart} />}
    {view === "team" && <TeamOverview state={state} config={config} weekStart={weekStart} weekdays={weekdays} onWeek={setWeekStart} />}
    {view === "requests" && <RequestsView state={state} actingUser={actingUser} admin={admin} onState={persistState} />}
    {view === "calendar" && admin && <CalendarView state={state} config={config} onConfig={setConfig} />}
    {view === "admin" && admin && <Administration state={state} onState={persistState} language={language} />}
  </div>;
}

function WeekView({ state, config, weekStart, weekdays, employee, onWeek }: { state: AppState; config: CalendarConfig; weekStart: Date; weekdays: Date[]; employee?: Employee; onWeek: (date: Date) => void }) {
  const language = state.organization.language;
  const activeEmployees = state.employees.filter((item) => item.active);
  if (!employee) return <main className="pc131-main"><Empty title={language === "fr" ? "Aucun employé actif" : "No active employees"} /></main>;
  return <main className="pc131-main">
    <WeekToolbar title={language === "fr" ? "Mon horaire de la semaine" : "My weekly schedule"} weekStart={weekStart} language={language} onWeek={onWeek} />
    <section className="pc131-week">{weekdays.map((date) => {
      const dateKey = toDateKey(date);
      const status = presenceStatus(state, employee, date);
      const requests = approvedRequests(state, employee.id, date);
      const assignments = assignmentsForEmployee(state, employee.id, date);
      const events = config.events.filter((event) => event.date === dateKey);
      const required = Math.max(config.defaultMinimumOnSite, ...events.map((event) => event.minimumOnSite), 0);
      const present = activeEmployees.filter((person) => presenceStatus(state, person, date) === "onsite").length;
      return <article className="pc131-day" key={dateKey}>
        <header><div><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long" })}</strong><small>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" })}</small></div><span className={`pc131-status ${status}`}>{status === "onsite" ? "🏢" : status === "remote" ? "🏠" : "🌴"} {presenceText(status, language)}</span></header>
        <div className="pc131-day-body">{requests.map((request) => <div className="pc131-item" key={request.id}><span>{request.type === "remote" ? "🏠" : "🌴"}</span><div><b>{requestLabel(request, language)}</b>{request.note && <small>{request.note}</small>}</div></div>)}{assignments.map((assignment) => <div className="pc131-item" key={assignment.id}><span>{assignmentIcon(assignment)}</span><div><b>{assignmentLabel(assignment, language, true)}</b>{assignment.timeLabel && <small>{assignment.timeLabel}</small>}{assignment.location && <small>{assignment.location}</small>}</div></div>)}{events.map((event) => <div className="pc131-item event" key={event.id}><span>📌</span><div><b>{event.title}</b>{event.time && <small>{event.time}</small>}</div></div>)}{!requests.length && !assignments.length && !events.length && <div className="pc131-default">🏢 {language === "fr" ? "Présentiel — aucune exception" : "On-site — no exception"}</div>}</div>
        <footer className={present >= required ? "good" : "bad"}><span>{language === "fr" ? "Présents" : "On-site"}: <b>{present}</b></span><span>Minimum: <b>{required}</b></span><strong>{present >= required ? "✓" : "⚠"}</strong></footer>
      </article>;
    })}</section>
    <section className="pc131-card pc131-rule"><strong>🏢 {language === "fr" ? "Règle de présence" : "Presence rule"}</strong><span>{language === "fr" ? "Un employé est présentiel par défaut. Un congé/une autre absence approuvée, le télétravail ou une affectation À distance le retire du calcul présentiel." : "Employees are on-site by default. Approved leave/other absence, remote work, or a Remote assignment removes them from on-site coverage."}</span></section>
  </main>;
}

function TeamOverview({ state, config, weekStart, weekdays, onWeek }: { state: AppState; config: CalendarConfig; weekStart: Date; weekdays: Date[]; onWeek: (date: Date) => void }) {
  const language = state.organization.language;
  const employees = state.employees.filter((employee) => employee.active);
  return <main className="pc131-main">
    <WeekToolbar title={language === "fr" ? "Vue d’ensemble de l’équipe" : "Team overview"} weekStart={weekStart} language={language} onWeek={onWeek} />
    <section className="pc131-card pc131-team-overview">
      <div className="pc131-overview-grid header"><div>{language === "fr" ? "Membre" : "Member"}</div>{weekdays.map((date) => <div key={toDateKey(date)}><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "short" })}</strong><small>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" })}</small></div>)}</div>
      {employees.map((employee) => <div className="pc131-overview-grid row" key={employee.id}><div className="member"><span className="avatar">{employee.initials}</span><div><strong>{employee.displayName}</strong><small>{accessLevel(employee.role) === "admin" ? "Admin" : (language === "fr" ? "Employé" : "Employee")}</small></div></div>{weekdays.map((date) => { const status = presenceStatus(state, employee, date); const items = assignmentsForEmployee(state, employee.id, date); return <div className="pc131-person-day" key={toDateKey(date)}><span className={`pc131-status ${status}`}>{status === "onsite" ? "🏢" : status === "remote" ? "🏠" : "🌴"} {presenceText(status, language)}</span>{items.slice(0, 2).map((item) => <small key={item.id}>{assignmentLabel(item, language, true)}</small>)}</div>; })}</div>)}
      {!employees.length && <Empty title={language === "fr" ? "Aucun membre dans l’équipe" : "No team members"} />}
    </section>
    <section className="pc131-coverage-strip">{weekdays.map((date) => { const dateKey = toDateKey(date); const events = config.events.filter((event) => event.date === dateKey); const required = Math.max(config.defaultMinimumOnSite, ...events.map((event) => event.minimumOnSite), 0); const present = employees.filter((employee) => presenceStatus(state, employee, date) === "onsite").length; return <article className={present >= required ? "good" : "bad"} key={dateKey}><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long" })}</strong><span>{language === "fr" ? "Présentiel" : "On-site"}: {present} / {required}</span></article>; })}</section>
  </main>;
}

function RequestsView({ state, actingUser, admin, onState }: { state: AppState; actingUser?: Employee; admin: boolean; onState: (state: AppState) => void }) {
  const language = state.organization.language;
  const [kind, setKind] = useState<"leave" | "remote" | "other">("leave");
  const [startDate, setStartDate] = useState(toDateKey(new Date()));
  const [endDate, setEndDate] = useState(toDateKey(new Date()));
  const [note, setNote] = useState("");
  const visible = admin ? state.requests : state.requests.filter((request) => request.employeeId === actingUser?.id);
  const submit = () => {
    if (!actingUser || !startDate || !endDate) return;
    const type: ScheduleRequest["type"] = kind === "remote" ? "remote" : kind === "leave" ? "vacation" : "absence";
    const request: ScheduleRequest = { id: `request-${Date.now()}`, employeeId: actingUser.id, type, startDate, endDate, note: note.trim() || undefined, status: admin ? "approved" : "pending", createdAt: new Date().toISOString(), reviewedBy: admin ? actingUser.id : undefined };
    onState({ ...state, requests: [request, ...state.requests] }); setNote("");
  };
  const update = (id: string, status: ScheduleRequest["status"]) => onState({ ...state, requests: state.requests.map((request) => request.id === id ? { ...request, status, reviewedBy: actingUser?.id } : request) });
  const remove = (id: string) => onState({ ...state, requests: state.requests.filter((request) => request.id !== id) });
  return <main className="pc131-main pc131-grid2">
    <section className="pc131-card pc131-section"><h1>📝 {language === "fr" ? "Nouvelle demande" : "New request"}</h1><p>{language === "fr" ? "Soumets un congé, une journée de télétravail ou une autre absence." : "Submit leave, remote work, or another absence."}</p><div className="pc131-form-grid"><label className="pc131-field full">{language === "fr" ? "Type de demande" : "Request type"}<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="leave">{language === "fr" ? "Congé" : "Leave"}</option><option value="remote">{language === "fr" ? "Télétravail" : "Remote work"}</option><option value="other">{language === "fr" ? "Autre" : "Other"}</option></select></label><label className="pc131-field">{language === "fr" ? "Début" : "Start"}<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="pc131-field">{language === "fr" ? "Fin" : "End"}<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label className="pc131-field full">Note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label></div><button className="pc131-button primary" disabled={!actingUser} onClick={submit}>{language === "fr" ? "Envoyer la demande" : "Submit request"}</button>{!admin && <small className="pc131-help">{language === "fr" ? "La demande doit être approuvée par un administrateur." : "The request must be approved by an administrator."}</small>}</section>
    <section className="pc131-card pc131-section"><h2>{admin ? (language === "fr" ? "Demandes de l’équipe" : "Team requests") : (language === "fr" ? "Mes demandes" : "My requests")}</h2><div className="pc131-request-list">{[...visible].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((request) => { const employee = state.employees.find((person) => person.id === request.employeeId); return <article key={request.id}><div className="grow"><strong>{requestLabel(request, language)} · {employee?.displayName ?? request.employeeId}</strong><span>{request.startDate}{request.endDate !== request.startDate ? ` → ${request.endDate}` : ""}</span>{request.note && <small>{request.note}</small>}</div><span className={`pc131-request-status ${request.status}`}>{request.status === "pending" ? (language === "fr" ? "En attente" : "Pending") : request.status === "approved" ? (language === "fr" ? "Approuvée" : "Approved") : (language === "fr" ? "Refusée" : "Rejected")}</span>{admin && request.status === "pending" && <div className="pc131-inline"><button className="pc131-button" onClick={() => update(request.id, "rejected")}>{language === "fr" ? "Refuser" : "Reject"}</button><button className="pc131-button primary" onClick={() => update(request.id, "approved")}>{language === "fr" ? "Approuver" : "Approve"}</button></div>}{(admin || request.employeeId === actingUser?.id) && <button className="pc131-button danger" onClick={() => remove(request.id)}>🗑</button>}</article>; })}{!visible.length && <Empty title={language === "fr" ? "Aucune demande" : "No requests"} />}</div></section>
  </main>;
}

function CalendarView({ state, config, onConfig }: { state: AppState; config: CalendarConfig; onConfig: (config: CalendarConfig) => void }) {
  const language = state.organization.language;
  const [title, setTitle] = useState(""); const [date, setDate] = useState(toDateKey(new Date())); const [time, setTime] = useState(""); const [minimum, setMinimum] = useState(config.defaultMinimumOnSite);
  const addEvent = () => { if (!title.trim()) return; const next: OperationalEvent = { id: `event-${Date.now()}`, title: title.trim(), date, time: time || undefined, minimumOnSite: Math.max(0, minimum) }; onConfig({ ...config, events: [...config.events, next].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`)) }); setTitle(""); setTime(""); };
  return <main className="pc131-main pc131-grid2"><section className="pc131-card pc131-section"><h2>Outlook</h2><p>{language === "fr" ? "Lien rapide vers un calendrier Outlook partagé ou personnel." : "Quick link to a shared or personal Outlook calendar."}</p><label className="pc131-field">{language === "fr" ? "Lien Outlook" : "Outlook link"}<div className="pc131-inline"><input value={config.outlookCalendarUrl} onChange={(event) => onConfig({ ...config, outlookCalendarUrl: event.target.value })} /><button className="pc131-button primary" onClick={() => window.open(config.outlookCalendarUrl || defaultConfig.outlookCalendarUrl, "_blank", "noopener,noreferrer")}>↗ {language === "fr" ? "Ouvrir" : "Open"}</button></div></label><h2>{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}</h2><label className="pc131-field">{language === "fr" ? "Minimum par défaut" : "Default minimum"}<input type="number" min="0" value={config.defaultMinimumOnSite} onChange={(event) => onConfig({ ...config, defaultMinimumOnSite: Math.max(0, Number(event.target.value) || 0) })} /></label></section><section className="pc131-card pc131-section"><h2>{language === "fr" ? "Événements et couverture" : "Events and coverage"}</h2><div className="pc131-form-grid"><label className="pc131-field full">{language === "fr" ? "Événement" : "Event"}<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="pc131-field">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="pc131-field">{language === "fr" ? "Heure" : "Time"}<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><label className="pc131-field">{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}<input type="number" min="0" value={minimum} onChange={(event) => setMinimum(Math.max(0, Number(event.target.value) || 0))} /></label></div><button className="pc131-button primary" disabled={!title.trim()} onClick={addEvent}>+ {language === "fr" ? "Ajouter" : "Add"}</button><div className="pc131-events">{config.events.map((event) => <article key={event.id}><div className="grow"><strong>{event.title}</strong><small>{formatLongDate(new Date(`${event.date}T12:00:00`), language)}{event.time ? ` · ${event.time}` : ""}</small></div><span className="pc131-badge">🏢 {event.minimumOnSite}</span><button className="pc131-button danger" onClick={() => onConfig({ ...config, events: config.events.filter((item) => item.id !== event.id) })}>🗑</button></article>)}</div></section></main>;
}

function Administration({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [tab, setTab] = useState<AdminTab>("types");
  return <main className="pc131-main"><section className="pc131-admin-head"><h1>⚙️ {language === "fr" ? "Administration" : "Administration"}</h1><p>{language === "fr" ? "Configure les affectations, l’horaire, les membres et le forfait." : "Configure assignments, schedules, members and plan."}</p></section><nav className="pc131-admin-tabs"><button className={tab === "types" ? "active" : ""} onClick={() => setTab("types")}>🧩 {language === "fr" ? "Types d’affectation" : "Assignment types"}</button><button className={tab === "planner" ? "active" : ""} onClick={() => setTab("planner")}>📋 {language === "fr" ? "Affecter l’horaire" : "Assign schedule"}</button><button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>👥 {language === "fr" ? "Membres et accès" : "Members & access"}</button><button className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>💳 {language === "fr" ? "Forfaits" : "Plans"}</button></nav>{tab === "types" && <AssignmentTypesAdmin state={state} onState={onState} language={language} />}{tab === "planner" && <WeeklyPlanner state={state} onState={onState} language={language} />}{tab === "members" && <TeamAdmin state={state} onState={onState} language={language} />}{tab === "plans" && <PlansAdmin state={state} onState={onState} language={language} />}</main>;
}

function AssignmentTypesAdmin({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [draft, setDraft] = useState<AssignmentDraft>(() => emptyAssignmentDraft(state));
  const editing = Boolean(draft.id);
  const save = () => { const labelFr = draft.labelFr.trim(); if (!labelFr || !draft.teamId || !draft.activeWeekdays.length) return; const id = draft.id ?? `assignment-${Date.now()}`; const item: AssignmentDefinition = { id, labelFr, labelEn: draft.labelEn.trim() || labelFr, shortLabelFr: draft.shortLabelFr.trim() || labelFr, shortLabelEn: draft.shortLabelEn.trim() || draft.labelEn.trim() || labelFr, timeLabel: draft.timeLabel.trim() || undefined, location: draft.location.trim() || undefined, category: draft.presenceCategory === "remote" ? "remote" : "other", minimumStaff: Math.max(0, Number(draft.minimumStaff) || 0), teamId: draft.teamId, activeWeekdays: [...draft.activeWeekdays].sort() }; onState({ ...state, assignments: editing ? state.assignments.map((current) => current.id === id ? item : current) : [...state.assignments, item] }); setDraft(emptyAssignmentDraft(state)); };
  const remove = (item: AssignmentDefinition) => { if (!window.confirm(language === "fr" ? `Supprimer « ${item.labelFr} » et les affectations liées ?` : `Delete “${item.labelEn}” and related assignments?`)) return; onState({ ...state, assignments: state.assignments.filter((current) => current.id !== item.id), cycleSlots: state.cycleSlots.filter((slot) => slot.assignmentId !== item.id), exceptions: state.exceptions.filter((exception) => exception.assignmentId !== item.id) }); if (draft.id === item.id) setDraft(emptyAssignmentDraft(state)); };
  const toggleDay = (day: number) => setDraft({ ...draft, activeWeekdays: draft.activeWeekdays.includes(day) ? draft.activeWeekdays.filter((value) => value !== day) : [...draft.activeWeekdays, day] });
  return <section className="pc131-admin-layout"><aside className="pc131-card pc131-list"><div className="pc131-list-toolbar"><h2>{language === "fr" ? "Types existants" : "Existing types"}</h2><button className="pc131-button primary" onClick={() => setDraft(emptyAssignmentDraft(state))}>+ {language === "fr" ? "Nouveau" : "New"}</button></div>{state.assignments.map((item) => <article className={draft.id === item.id ? "selected" : ""} key={item.id}><button className="pc131-list-main" onClick={() => setDraft(draftFromAssignment(item))}><strong>{assignmentIcon(item)} {assignmentLabel(item, language)}</strong><small>{assignmentIsRemote(item) ? (language === "fr" ? "À distance" : "Remote") : (language === "fr" ? "Présentiel" : "On-site")}</small></button><button className="pc131-button danger" onClick={() => remove(item)}>🗑</button></article>)}{!state.assignments.length && <Empty title={language === "fr" ? "Aucun type d’affectation" : "No assignment types"} />}</aside><section className="pc131-card pc131-editor"><h2>{editing ? (language === "fr" ? "Modifier le type" : "Edit type") : (language === "fr" ? "Créer un type d’affectation" : "Create assignment type")}</h2><div className="pc131-form-grid"><label className="pc131-field full">{language === "fr" ? "Nom" : "Name"}<input value={draft.labelFr} onChange={(event) => setDraft({ ...draft, labelFr: event.target.value })} /></label><label className="pc131-field">{language === "fr" ? "Nom court" : "Short name"}<input value={draft.shortLabelFr} onChange={(event) => setDraft({ ...draft, shortLabelFr: event.target.value })} /></label><label className="pc131-field">{language === "fr" ? "Catégorie" : "Category"}<select value={draft.presenceCategory} onChange={(event) => setDraft({ ...draft, presenceCategory: event.target.value as PresenceCategory })}><option value="onsite">🏢 {language === "fr" ? "Présentiel" : "On-site"}</option><option value="remote">🏠 {language === "fr" ? "À distance" : "Remote"}</option></select></label><label className="pc131-field">{language === "fr" ? "Plage horaire" : "Time"}<input value={draft.timeLabel} onChange={(event) => setDraft({ ...draft, timeLabel: event.target.value })} placeholder="08:00–12:00" /></label><label className="pc131-field">{language === "fr" ? "Lieu" : "Location"}<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label><label className="pc131-field">{language === "fr" ? "Minimum pour cette affectation" : "Minimum for this assignment"}<input type="number" min="0" value={draft.minimumStaff} onChange={(event) => setDraft({ ...draft, minimumStaff: Math.max(0, Number(event.target.value) || 0) })} /></label><label className="pc131-field">{language === "fr" ? "Équipe" : "Team"}<select value={draft.teamId} onChange={(event) => setDraft({ ...draft, teamId: event.target.value })}>{state.teams.filter((team) => team.active).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label></div><div className="pc131-weekdays"><strong>{language === "fr" ? "Jours actifs" : "Active days"}</strong>{WEEKDAYS.map((day) => <button className={draft.activeWeekdays.includes(day.value) ? "active" : ""} key={day.value} onClick={() => toggleDay(day.value)}>{language === "fr" ? day.fr : day.en}</button>)}</div><div className="pc131-category-help">{draft.presenceCategory === "onsite" ? (language === "fr" ? "🏢 Cette affectation compte comme présentiel." : "🏢 This assignment counts as on-site.") : (language === "fr" ? "🏠 Cette affectation retire la personne du calcul présentiel." : "🏠 This assignment removes the person from on-site coverage.")}</div><div className="pc131-actions"><button className="pc131-button" onClick={() => setDraft(emptyAssignmentDraft(state))}>{language === "fr" ? "Annuler" : "Cancel"}</button><button className="pc131-button primary" disabled={!draft.labelFr.trim() || !draft.teamId || !draft.activeWeekdays.length} onClick={save}>{editing ? (language === "fr" ? "Enregistrer" : "Save") : (language === "fr" ? "Créer" : "Create")}</button></div></section></section>;
}

function WeeklyPlanner({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const activeEmployees = state.employees.filter((employee) => employee.active);
  const update = (assignmentId: string, weekday: number, employeeId: string, checked: boolean) => { const existing = weeklySlot(state, assignmentId, weekday); const currentIds = existing?.employeeIds ?? []; const employeeIds = checked ? [...new Set([...currentIds, employeeId])] : currentIds.filter((id) => id !== employeeId); const without = state.cycleSlots.filter((slot) => !(slot.assignmentId === assignmentId && slot.weekday === weekday)); onState({ ...state, cycleSlots: [...without, { cycle: "A", assignmentId, weekday, employeeIds }, { cycle: "B", assignmentId, weekday, employeeIds }] }); };
  return <section className="pc131-card pc131-planner"><h2>{language === "fr" ? "Affecter l’horaire hebdomadaire" : "Assign weekly schedule"}</h2><p>{language === "fr" ? "Cet horaire se répète chaque semaine." : "This schedule repeats every week."}</p>{state.assignments.map((assignment) => <article className="pc131-planner-block" key={assignment.id}><header><strong>{assignmentIcon(assignment)} {assignmentLabel(assignment, language)}</strong><span>{assignment.timeLabel || assignment.location || ""}</span></header><div className="pc131-planner-days">{WEEKDAYS.filter((day) => !assignment.activeWeekdays?.length || assignment.activeWeekdays.includes(day.value)).map((day) => <div key={day.value}><b>{language === "fr" ? day.fr : day.en}</b>{activeEmployees.map((employee) => { const checked = weeklySlot(state, assignment.id, day.value)?.employeeIds.includes(employee.id) ?? false; return <label key={employee.id}><input type="checkbox" checked={checked} onChange={(event) => update(assignment.id, day.value, employee.id, event.target.checked)} />{employee.displayName}</label>; })}</div>)}</div></article>)}{!state.assignments.length && <Empty title={language === "fr" ? "Crée d’abord un type d’affectation" : "Create an assignment type first"} />}</section>;
}

function TeamAdmin({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [name, setName] = useState(""); const [jobTitle, setJobTitle] = useState(""); const [level, setLevel] = useState<AccessLevel>("employee"); const [teamId, setTeamId] = useState(state.teams.find((team) => team.active)?.id ?? state.teams[0]?.id ?? "main");
  const add = () => { if (!name.trim() || !teamId) return; const employee: Employee = { id: `employee-${Date.now()}`, displayName: name.trim(), initials: initials(name), jobTitle: jobTitle.trim() || (language === "fr" ? "Employé" : "Employee"), teamId, role: level === "admin" ? "admin" : "employee", active: true }; onState({ ...state, employees: [...state.employees, employee] }); setName(""); setJobTitle(""); setLevel("employee"); };
  const update = (id: string, patch: Partial<Employee>) => onState({ ...state, employees: state.employees.map((employee) => employee.id === id ? { ...employee, ...patch } : employee) });
  const remove = (id: string) => onState({ ...state, employees: state.employees.filter((employee) => employee.id !== id), cycleSlots: state.cycleSlots.map((slot) => ({ ...slot, employeeIds: slot.employeeIds.filter((employeeId) => employeeId !== id) })), exceptions: state.exceptions.map((exception) => ({ ...exception, employeeIds: exception.employeeIds.filter((employeeId) => employeeId !== id) })), requests: state.requests.filter((request) => request.employeeId !== id) });
  return <section className="pc131-grid2"><section className="pc131-card pc131-section"><h2>+ {language === "fr" ? "Ajouter un membre" : "Add member"}</h2><div className="pc131-form-grid"><label className="pc131-field full">{language === "fr" ? "Nom" : "Name"}<input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="pc131-field">{language === "fr" ? "Titre" : "Title"}<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></label><label className="pc131-field">{language === "fr" ? "Type d’accès" : "Access type"}<select value={level} onChange={(event) => setLevel(event.target.value as AccessLevel)}><option value="employee">{language === "fr" ? "Employé" : "Employee"}</option><option value="admin">Admin</option></select></label><label className="pc131-field full">{language === "fr" ? "Équipe" : "Team"}<select value={teamId} onChange={(event) => setTeamId(event.target.value)}>{state.teams.filter((team) => team.active).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label></div><button className="pc131-button primary" disabled={!name.trim()} onClick={add}>{language === "fr" ? "Ajouter le membre" : "Add member"}</button></section><section className="pc131-card pc131-section"><h2>{language === "fr" ? "Membres et accès" : "Members & access"}</h2><div className="pc131-member-list">{state.employees.map((employee) => <article key={employee.id}><span className="avatar">{employee.initials}</span><div className="grow"><strong>{employee.displayName}</strong><small>{employee.jobTitle}</small></div><select value={accessLevel(employee.role)} onChange={(event) => update(employee.id, { role: event.target.value === "admin" ? "admin" : "employee" })}><option value="employee">{language === "fr" ? "Employé" : "Employee"}</option><option value="admin">Admin</option></select><button className="pc131-button" onClick={() => update(employee.id, { active: !employee.active })}>{employee.active ? (language === "fr" ? "Désactiver" : "Disable") : (language === "fr" ? "Activer" : "Enable")}</button><button className="pc131-button danger" onClick={() => remove(employee.id)}>🗑</button></article>)}</div></section></section>;
}

function PlansAdmin({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const current = state.organization.planId;
  const plans: PlanId[] = ["free", "team", "business"];
  return <section className="pc131-card pc131-section"><div className="pc131-plans-head"><div><h2>{language === "fr" ? "Forfaits PiloteCalendar" : "PiloteCalendar plans"}</h2><p>{language === "fr" ? "L’administrateur peut voir le forfait actuel et comparer les niveaux disponibles." : "Administrators can view the current plan and compare available tiers."}</p></div><span className="pc131-current-plan">{language === "fr" ? "Forfait actuel" : "Current plan"}: <b>{PLAN_INFO[current][language]}</b></span></div><div className="pc131-plan-cards">{plans.map((planId) => { const info = PLAN_INFO[planId]; const features = language === "fr" ? info.featuresFr : info.featuresEn; return <article className={current === planId ? "current" : ""} key={planId}><div className="pc131-plan-title"><span className={`pc131-plan-badge ${planId}`}>{info[language]}</span>{current === planId && <span className="pc131-selected">✓ {language === "fr" ? "Actuel" : "Current"}</span>}</div><h3>{info[language]}</h3><div className="pc131-plan-limits"><span>👤 {language === "fr" ? "Employés" : "Employees"}: <b>{info.employees}</b></span><span>👥 {language === "fr" ? "Équipes" : "Teams"}: <b>{info.teams}</b></span></div><ul>{features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button className={`pc131-button ${current === planId ? "" : "primary"}`} disabled={current === planId} onClick={() => onState({ ...state, organization: { ...state.organization, planId } })}>{current === planId ? (language === "fr" ? "Forfait actuel" : "Current plan") : (language === "fr" ? "Sélectionner ce forfait" : "Select this plan")}</button></article>; })}</div><div className="pc131-plan-note">ℹ️ {language === "fr" ? "Pour le moment, le changement de forfait sert à tester les niveaux fonctionnels. La facturation n’est pas encore reliée." : "For now, switching plans is for testing feature tiers. Billing is not connected yet."}</div></section>;
}

function WeekToolbar({ title, weekStart, language, onWeek }: { title: string; weekStart: Date; language: Language; onWeek: (date: Date) => void }) {
  return <section className="pc131-card pc131-toolbar"><div className="pc131-inline"><button className="pc131-button" onClick={() => onWeek(addDays(weekStart, -7))}>‹</button><button className="pc131-button" onClick={() => onWeek(startOfWeek(new Date()))}>{language === "fr" ? "Aujourd’hui" : "Today"}</button><button className="pc131-button" onClick={() => onWeek(addDays(weekStart, 7))}>›</button></div><div className="center"><h1>{title}</h1><p>{formatWeekRange(weekStart, language)}</p></div><div /></section>;
}

function Empty({ title }: { title: string }) { return <div className="pc131-empty"><span>📭</span><strong>{title}</strong></div>; }
