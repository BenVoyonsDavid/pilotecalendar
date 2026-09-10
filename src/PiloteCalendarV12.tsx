import { useEffect, useMemo, useState } from "react";
import "./PiloteCalendarV12.css";
import { saveServerState } from "./backend";
import { addDays, dateInRange, formatLongDate, formatWeekRange, startOfWeek, toDateKey } from "./dateUtils";
import { createBlankCompanyState } from "./sampleData";
import type { AppState, AssignmentDefinition, Employee, Language, ScheduleRequest } from "./types";
import type { TeamsContextInfo } from "./teams";

type View = "week" | "calendar" | "admin";
type AdminView = "types" | "planner" | "team";
type PresenceStatus = "onsite" | "remote" | "erg" | "leave";
type Category = AssignmentDefinition["category"];

type OperationalEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  minimumOnSite: number;
};

type CalendarConfig = {
  outlookCalendarUrl: string;
  defaultMinimumOnSite: number;
  events: OperationalEvent[];
};

type AssignmentDraft = {
  id?: string;
  labelFr: string;
  labelEn: string;
  shortLabelFr: string;
  shortLabelEn: string;
  timeLabel: string;
  location: string;
  category: Category;
  minimumStaff: number;
  teamId: string;
  activeWeekdays: number[];
};

const STORAGE_KEY = "horaireTeams.v1";
const CONFIG_KEY = "pilotecalendar.v1.2.config";
const LEGACY_KEYS = ["horaireTeams.v1rc1", "horaireTeams.v0.5", "horaireTeams.v0.4"];

const WEEKDAYS = [
  { value: 1, fr: "Lun", en: "Mon" },
  { value: 2, fr: "Mar", en: "Tue" },
  { value: 3, fr: "Mer", en: "Wed" },
  { value: 4, fr: "Jeu", en: "Thu" },
  { value: 5, fr: "Ven", en: "Fri" },
];

const CATEGORY_LABELS: Record<Category, { fr: string; en: string }> = {
  classes: { fr: "Soutien / classes", en: "Class support" },
  remote: { fr: "Télétravail", en: "Remote work" },
  site: { fr: "Site / déplacement", en: "Site / travel" },
  escalation: { fr: "Escalade", en: "Escalation" },
  absence: { fr: "Congé / absence", en: "Leave / absence" },
  other: { fr: "Autre", en: "Other" },
};

const defaultConfig: CalendarConfig = {
  outlookCalendarUrl: "https://outlook.office.com/calendar/view/week",
  defaultMinimumOnSite: 1,
  events: [],
};

function readState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.organization?.isDemo) return parsed;
    }
  } catch {
    // Use a clean state below.
  }
  return createBlankCompanyState("fr", "free", "Mon organisation");
}

function readConfig(): CalendarConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CalendarConfig>;
      return {
        outlookCalendarUrl: parsed.outlookCalendarUrl || defaultConfig.outlookCalendarUrl,
        defaultMinimumOnSite: Math.max(0, Number(parsed.defaultMinimumOnSite ?? 1)),
        events: Array.isArray(parsed.events) ? parsed.events : [],
      };
    }
  } catch {
    // Use defaults below.
  }
  return defaultConfig;
}

function assignmentLabel(item: AssignmentDefinition, language: Language, short = false) {
  if (language === "fr") return short ? item.shortLabelFr || item.labelFr : item.labelFr;
  return short ? item.shortLabelEn || item.labelEn : item.labelEn;
}

function assignmentIcon(item: AssignmentDefinition) {
  if (item.category === "classes") return "🎓";
  if (item.category === "remote") return "🏠";
  if (item.category === "absence") return "🌴";
  if (isErgAssignment(item)) return "📍";
  if (item.category === "site") return "📍";
  if (item.category === "escalation") return "📞";
  return "•";
}

function requestLabel(request: ScheduleRequest, language: Language) {
  if (language === "fr") {
    if (request.type === "remote") return "Télétravail";
    if (request.type === "vacation") return "Vacances";
    return "Congé / absence";
  }
  if (request.type === "remote") return "Remote work";
  if (request.type === "vacation") return "Vacation";
  return "Leave / absence";
}

function isErgAssignment(item: AssignmentDefinition) {
  return [item.id, item.location, item.labelFr, item.labelEn, item.shortLabelFr, item.shortLabelEn]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes("erg");
}

function weeklySlot(state: AppState, assignmentId: string, weekday: number) {
  return state.cycleSlots.find((slot) => slot.assignmentId === assignmentId && slot.weekday === weekday && slot.cycle === "A")
    ?? state.cycleSlots.find((slot) => slot.assignmentId === assignmentId && slot.weekday === weekday);
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
  return state.requests.filter((request) =>
    request.employeeId === employeeId &&
    request.status === "approved" &&
    dateInRange(date, request.startDate, request.endDate)
  );
}

function presenceStatus(state: AppState, employee: Employee, date: Date): PresenceStatus {
  const requests = approvedRequests(state, employee.id, date);
  if (requests.some((request) => request.type === "vacation" || request.type === "absence")) return "leave";
  if (requests.some((request) => request.type === "remote")) return "remote";
  const assignments = assignmentsForEmployee(state, employee.id, date);
  if (assignments.some((assignment) => assignment.category === "remote")) return "remote";
  if (assignments.some(isErgAssignment)) return "erg";
  return "onsite";
}

function presenceText(status: PresenceStatus, language: Language) {
  if (language === "fr") {
    if (status === "onsite") return "Présentiel";
    if (status === "remote") return "Télétravail";
    if (status === "erg") return "ERG";
    return "Congé / absence";
  }
  if (status === "onsite") return "On-site";
  if (status === "remote") return "Remote";
  if (status === "erg") return "ERG";
  return "Leave / absence";
}

function emptyAssignmentDraft(state: AppState): AssignmentDraft {
  return {
    labelFr: "",
    labelEn: "",
    shortLabelFr: "",
    shortLabelEn: "",
    timeLabel: "",
    location: "",
    category: "other",
    minimumStaff: 0,
    teamId: state.teams.find((team) => team.active)?.id ?? state.teams[0]?.id ?? "main",
    activeWeekdays: [1, 2, 3, 4, 5],
  };
}

function draftFromAssignment(item: AssignmentDefinition): AssignmentDraft {
  return {
    id: item.id,
    labelFr: item.labelFr,
    labelEn: item.labelEn,
    shortLabelFr: item.shortLabelFr,
    shortLabelEn: item.shortLabelEn,
    timeLabel: item.timeLabel ?? "",
    location: item.location ?? "",
    category: item.category,
    minimumStaff: item.minimumStaff,
    teamId: item.teamId,
    activeWeekdays: item.activeWeekdays?.length ? [...item.activeWeekdays] : [1, 2, 3, 4, 5],
  };
}

export default function PiloteCalendarV12({ teamsContext }: { teamsContext?: TeamsContextInfo }) {
  const [view, setView] = useState<View>("week");
  const [state, setState] = useState<AppState>(() => readState());
  const [config, setConfig] = useState<CalendarConfig>(() => readConfig());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  useEffect(() => {
    try {
      for (const key of LEGACY_KEYS) localStorage.removeItem(key);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && (JSON.parse(raw) as AppState).organization?.isDemo) {
        const clean = createBlankCompanyState("fr", "free", "Mon organisation");
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        setState(clean);
      }
    } catch {
      // Ignore malformed legacy data.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const active = state.employees.filter((employee) => employee.active);
    const current = teamsContext?.userId ? active.find((employee) => employee.microsoftUserId === teamsContext.userId) : undefined;
    if (current) setSelectedEmployeeId(current.id);
    else if (!active.some((employee) => employee.id === selectedEmployeeId)) setSelectedEmployeeId(active[0]?.id ?? "");
  }, [state.employees, teamsContext?.userId, selectedEmployeeId]);

  const language = state.organization.language;
  const selectedEmployee = state.employees.find((employee) => employee.id === selectedEmployeeId && employee.active)
    ?? state.employees.find((employee) => employee.active);
  const weekdays = useMemo(() => [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset)), [weekStart]);

  const persistState = (next: AppState) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    void saveServerState(next);
  };

  return <div className="pc12">
    <header className="pc12-top">
      <div className="pc12-brand"><span className="pc12-brand-icon">📅</span><div><strong>PiloteCalendar</strong><small>v1.2.0</small></div></div>
      <nav className="pc12-nav">
        <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>📆 {language === "fr" ? "Ma semaine" : "My week"}</button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>🗓️ {language === "fr" ? "Calendrier central" : "Central calendar"}</button>
        <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>⚙️ {language === "fr" ? "Administration" : "Administration"}</button>
      </nav>
    </header>

    {view === "week" && <WeekView state={state} config={config} weekStart={weekStart} weekdays={weekdays} selectedEmployee={selectedEmployee} selectedEmployeeId={selectedEmployeeId} onEmployee={setSelectedEmployeeId} onWeek={setWeekStart} />}
    {view === "calendar" && <CalendarView state={state} config={config} onConfig={setConfig} />}
    {view === "admin" && <Administration state={state} onState={persistState} language={language} />}
  </div>;
}

function WeekView({ state, config, weekStart, weekdays, selectedEmployee, selectedEmployeeId, onEmployee, onWeek }: {
  state: AppState;
  config: CalendarConfig;
  weekStart: Date;
  weekdays: Date[];
  selectedEmployee?: Employee;
  selectedEmployeeId: string;
  onEmployee: (id: string) => void;
  onWeek: (date: Date) => void;
}) {
  const language = state.organization.language;
  const activeEmployees = state.employees.filter((employee) => employee.active);

  return <main className="pc12-main">
    <section className="pc12-card pc12-toolbar">
      <div className="pc12-buttons"><button className="pc12-button" onClick={() => onWeek(addDays(weekStart, -7))}>‹</button><button className="pc12-button" onClick={() => onWeek(startOfWeek(new Date()))}>{language === "fr" ? "Aujourd’hui" : "Today"}</button><button className="pc12-button" onClick={() => onWeek(addDays(weekStart, 7))}>›</button></div>
      <div className="center"><h1>{language === "fr" ? "Mon horaire de la semaine" : "My weekly schedule"}</h1><p>{formatWeekRange(weekStart, language)}</p></div>
      <label className="right pc12-field">{language === "fr" ? "Afficher" : "Show"}<select className="pc12-select" value={selectedEmployeeId} onChange={(event) => onEmployee(event.target.value)}>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></label>
    </section>

    {!selectedEmployee ? <section className="pc12-card pc12-empty"><strong>{language === "fr" ? "Aucun employé actif" : "No active employees"}</strong><span>{language === "fr" ? "Ajoute les employés dans Administration → Équipe." : "Add employees in Administration → Team."}</span></section> : <>
      <section className="pc12-week">
        {weekdays.map((date) => {
          const dateKey = toDateKey(date);
          const status = presenceStatus(state, selectedEmployee, date);
          const requests = approvedRequests(state, selectedEmployee.id, date);
          const assignments = assignmentsForEmployee(state, selectedEmployee.id, date);
          const events = config.events.filter((event) => event.date === dateKey);
          const required = Math.max(config.defaultMinimumOnSite, ...events.map((event) => event.minimumOnSite), 0);
          const present = activeEmployees.filter((employee) => presenceStatus(state, employee, date) === "onsite").length;
          const covered = present >= required;
          return <article className="pc12-day" key={dateKey}>
            <header><div><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long" })}</strong><small>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" })}</small></div><span className={`pc12-status ${status}`}>{status === "onsite" ? "🏢" : status === "remote" ? "🏠" : status === "erg" ? "📍" : "🌴"} {presenceText(status, language)}</span></header>
            <div className="pc12-day-body">
              {requests.map((request) => <div className="pc12-item" key={request.id}><span>{request.type === "remote" ? "🏠" : "🌴"}</span><div><b>{requestLabel(request, language)}</b>{request.note && <small>{request.note}</small>}</div></div>)}
              {assignments.map((assignment) => <div className="pc12-item" key={assignment.id}><span>{assignmentIcon(assignment)}</span><div><b>{assignmentLabel(assignment, language, true)}</b>{assignment.timeLabel && <small>{assignment.timeLabel}</small>}{assignment.location && <small>{assignment.location}</small>}</div></div>)}
              {events.map((event) => <div className="pc12-item" key={event.id}><span>📌</span><div><b>{event.title}</b>{event.time && <small>{event.time}</small>}<small>{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}: {event.minimumOnSite}</small></div></div>)}
              {!requests.length && !assignments.length && !events.length && <div className="pc12-default">🏢 {language === "fr" ? "Présentiel — aucune exception" : "On-site — no exception"}</div>}
            </div>
            <footer className={`pc12-coverage ${covered ? "good" : "bad"}`}><span>{language === "fr" ? "Présents" : "On-site"}: <b>{present}</b></span><span>{language === "fr" ? "Minimum" : "Minimum"}: <b>{required}</b></span><strong>{covered ? "✓" : "⚠"}</strong></footer>
          </article>;
        })}
      </section>
      <section className="pc12-card pc12-rule"><strong>🏢 {language === "fr" ? "Calcul du présentiel" : "On-site calculation"}</strong><span>{language === "fr" ? "Tout employé actif est considéré présentiel sauf s’il est en congé/absence, en télétravail ou affecté à ERG." : "Every active employee counts as on-site unless on leave, remote work, or assigned to ERG."}</span></section>
    </>}
  </main>;
}

function CalendarView({ state, config, onConfig }: { state: AppState; config: CalendarConfig; onConfig: (config: CalendarConfig) => void }) {
  const language = state.organization.language;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDateKey(new Date()));
  const [time, setTime] = useState("");
  const [minimum, setMinimum] = useState(config.defaultMinimumOnSite);

  const addEvent = () => {
    if (!title.trim()) return;
    const next: OperationalEvent = { id: `event-${Date.now()}`, title: title.trim(), date, time: time || undefined, minimumOnSite: Math.max(0, minimum) };
    onConfig({ ...config, events: [...config.events, next].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`)) });
    setTitle("");
    setTime("");
  };

  return <main className="pc12-main pc12-grid2">
    <section className="pc12-card pc12-section">
      <h2>Outlook</h2><p>{language === "fr" ? "Lien rapide vers ton calendrier Outlook partagé ou personnel." : "Quick link to your shared or personal Outlook calendar."}</p>
      <label className="pc12-field">{language === "fr" ? "Lien du calendrier Outlook" : "Outlook calendar link"}<div className="pc12-outlook"><input className="pc12-input" value={config.outlookCalendarUrl} onChange={(event) => onConfig({ ...config, outlookCalendarUrl: event.target.value })} /><button className="pc12-button primary" onClick={() => window.open(config.outlookCalendarUrl || defaultConfig.outlookCalendarUrl, "_blank", "noopener,noreferrer")}>↗ {language === "fr" ? "Ouvrir" : "Open"}</button></div></label>
      <h2>{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}</h2><p>{language === "fr" ? "Définis le minimum normal pour une journée. Un événement peut augmenter ce minimum." : "Set the normal daily minimum. An event can increase it."}</p>
      <label className="pc12-field">{language === "fr" ? "Minimum par défaut" : "Default minimum"}<input className="pc12-input" type="number" min="0" value={config.defaultMinimumOnSite} onChange={(event) => onConfig({ ...config, defaultMinimumOnSite: Math.max(0, Number(event.target.value) || 0) })} /></label>
    </section>

    <section className="pc12-card pc12-section">
      <h2>{language === "fr" ? "Événements et couverture" : "Events and coverage"}</h2><p>{language === "fr" ? "Chaque événement peut imposer son propre nombre minimal de personnes en présentiel." : "Each event can require its own minimum number of on-site staff."}</p>
      <div className="pc12-form-grid">
        <label className="pc12-field full">{language === "fr" ? "Nom de l’événement" : "Event name"}<input className="pc12-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={language === "fr" ? "Ex. Journée d’accueil" : "E.g. Welcome day"} /></label>
        <label className="pc12-field">Date<input className="pc12-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="pc12-field">{language === "fr" ? "Heure" : "Time"}<input className="pc12-input" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label className="pc12-field">{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}<input className="pc12-input" type="number" min="0" value={minimum} onChange={(event) => setMinimum(Math.max(0, Number(event.target.value) || 0))} /></label>
      </div>
      <button className="pc12-button primary" disabled={!title.trim()} onClick={addEvent}>+ {language === "fr" ? "Ajouter l’événement" : "Add event"}</button>
      <div className="pc12-events">{config.events.map((event) => <article className="pc12-event" key={event.id}><div className="grow"><strong>{event.title}</strong><small>{formatLongDate(new Date(`${event.date}T12:00:00`), language)}{event.time ? ` · ${event.time}` : ""}</small></div><span className="pc12-badge">🏢 {event.minimumOnSite}</span><button className="pc12-button danger" onClick={() => onConfig({ ...config, events: config.events.filter((item) => item.id !== event.id) })}>Supprimer</button></article>)}</div>
    </section>
  </main>;
}

function Administration({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [tab, setTab] = useState<AdminView>("types");
  return <main className="pc12-main">
    <div className="pc12-admin-head"><div><h1>⚙️ {language === "fr" ? "Administration" : "Administration"}</h1><p>{language === "fr" ? "Gère les types d’affectation, l’horaire hebdomadaire et les employés." : "Manage assignment types, the weekly schedule and employees."}</p></div></div>
    <div className="pc12-admin-tabs"><button className={tab === "types" ? "active" : ""} onClick={() => setTab("types")}>🧩 {language === "fr" ? "Types d’affectation" : "Assignment types"}</button><button className={tab === "planner" ? "active" : ""} onClick={() => setTab("planner")}>📋 {language === "fr" ? "Affecter l’horaire" : "Assign schedule"}</button><button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>👥 {language === "fr" ? "Équipe" : "Team"}</button></div>
    {tab === "types" && <AssignmentTypesAdmin state={state} onState={onState} language={language} />}
    {tab === "planner" && <WeeklyPlanner state={state} onState={onState} language={language} />}
    {tab === "team" && <TeamAdmin state={state} onState={onState} language={language} />}
  </main>;
}

function AssignmentTypesAdmin({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [draft, setDraft] = useState<AssignmentDraft>(() => emptyAssignmentDraft(state));
  const [search, setSearch] = useState("");
  const filtered = state.assignments.filter((item) => !search.trim() || `${item.labelFr} ${item.shortLabelFr} ${item.location ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const editing = Boolean(draft.id);

  const save = () => {
    const labelFr = draft.labelFr.trim();
    if (!labelFr || !draft.teamId || !draft.activeWeekdays.length) return;
    const id = draft.id ?? `assignment-${Date.now()}`;
    const item: AssignmentDefinition = {
      id,
      labelFr,
      labelEn: draft.labelEn.trim() || labelFr,
      shortLabelFr: draft.shortLabelFr.trim() || labelFr,
      shortLabelEn: draft.shortLabelEn.trim() || draft.labelEn.trim() || labelFr,
      timeLabel: draft.timeLabel.trim() || undefined,
      location: draft.location.trim() || undefined,
      category: draft.category,
      minimumStaff: Math.max(0, Number(draft.minimumStaff) || 0),
      teamId: draft.teamId,
      activeWeekdays: [...draft.activeWeekdays].sort(),
    };
    onState({ ...state, assignments: editing ? state.assignments.map((current) => current.id === id ? item : current) : [...state.assignments, item] });
    setDraft(emptyAssignmentDraft(state));
  };

  const remove = (item: AssignmentDefinition) => {
    if (!window.confirm(language === "fr" ? `Supprimer « ${item.labelFr} » et ses affectations planifiées ?` : `Delete “${item.labelEn}” and its scheduled assignments?`)) return;
    onState({ ...state, assignments: state.assignments.filter((current) => current.id !== item.id), cycleSlots: state.cycleSlots.filter((slot) => slot.assignmentId !== item.id), exceptions: state.exceptions.filter((exception) => exception.assignmentId !== item.id) });
    if (draft.id === item.id) setDraft(emptyAssignmentDraft(state));
  };

  const toggleDay = (day: number) => setDraft({ ...draft, activeWeekdays: draft.activeWeekdays.includes(day) ? draft.activeWeekdays.filter((value) => value !== day) : [...draft.activeWeekdays, day] });

  return <section className="pc12-admin-layout">
    <aside className="pc12-card pc12-list">
      <div className="pc12-list-toolbar"><input className="pc12-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "fr" ? "Rechercher…" : "Search…"} /><button className="pc12-button primary" onClick={() => setDraft(emptyAssignmentDraft(state))}>+ Nouveau</button></div>
      {filtered.map((item) => <article className={`pc12-list-item ${draft.id === item.id ? "selected" : ""}`} key={item.id}><button className="pc12-list-main" onClick={() => setDraft(draftFromAssignment(item))}><strong>{assignmentIcon(item)} {assignmentLabel(item, language)}</strong><small>{CATEGORY_LABELS[item.category][language]}{item.location ? ` · ${item.location}` : ""}</small></button><button className="pc12-button danger" onClick={() => remove(item)}>🗑</button></article>)}
      {!filtered.length && <div className="pc12-empty"><strong>{language === "fr" ? "Aucun type d’affectation" : "No assignment types"}</strong><span>{language === "fr" ? "Clique sur + Nouveau pour créer le premier." : "Click + New to create the first one."}</span></div>}
    </aside>

    <section className="pc12-card pc12-editor">
      <h2>{editing ? (language === "fr" ? "Modifier le type d’affectation" : "Edit assignment type") : (language === "fr" ? "Créer un type d’affectation" : "Create assignment type")}</h2>
      <div className="pc12-form-grid">
        <label className="pc12-field">{language === "fr" ? "Nom" : "Name"}<input className="pc12-input" value={draft.labelFr} onChange={(event) => setDraft({ ...draft, labelFr: event.target.value })} placeholder="Ex. Soutien aux classes" /></label>
        <label className="pc12-field">{language === "fr" ? "Nom court" : "Short name"}<input className="pc12-input" value={draft.shortLabelFr} onChange={(event) => setDraft({ ...draft, shortLabelFr: event.target.value })} placeholder="Ex. Classes" /></label>
        <label className="pc12-field">{language === "fr" ? "Nom anglais (optionnel)" : "English name"}<input className="pc12-input" value={draft.labelEn} onChange={(event) => setDraft({ ...draft, labelEn: event.target.value })} /></label>
        <label className="pc12-field">{language === "fr" ? "Nom court anglais (optionnel)" : "English short name"}<input className="pc12-input" value={draft.shortLabelEn} onChange={(event) => setDraft({ ...draft, shortLabelEn: event.target.value })} /></label>
        <label className="pc12-field">{language === "fr" ? "Catégorie" : "Category"}<select className="pc12-select" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as Category })}>{(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => <option value={category} key={category}>{CATEGORY_LABELS[category][language]}</option>)}</select></label>
        <label className="pc12-field">{language === "fr" ? "Équipe" : "Team"}<select className="pc12-select" value={draft.teamId} onChange={(event) => setDraft({ ...draft, teamId: event.target.value })}>{state.teams.filter((team) => team.active).map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        <label className="pc12-field">{language === "fr" ? "Plage horaire" : "Time range"}<input className="pc12-input" value={draft.timeLabel} onChange={(event) => setDraft({ ...draft, timeLabel: event.target.value })} placeholder="08:00–12:00" /></label>
        <label className="pc12-field">{language === "fr" ? "Lieu" : "Location"}<input className="pc12-input" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
        <label className="pc12-field">{language === "fr" ? "Minimum pour cette affectation" : "Minimum for this assignment"}<input className="pc12-input" type="number" min="0" value={draft.minimumStaff} onChange={(event) => setDraft({ ...draft, minimumStaff: Math.max(0, Number(event.target.value) || 0) })} /></label>
      </div>
      <label className="pc12-field">{language === "fr" ? "Jours actifs" : "Active days"}<div className="pc12-weekdays">{WEEKDAYS.map((day) => <button className={draft.activeWeekdays.includes(day.value) ? "active" : ""} key={day.value} onClick={() => toggleDay(day.value)}>{day[language]}</button>)}</div></label>
      <section className="pc12-card pc12-rule"><strong>{draft.category === "remote" || draft.category === "absence" || draft.location.toLowerCase().includes("erg") || draft.labelFr.toLowerCase().includes("erg") ? "🚫" : "🏢"} {language === "fr" ? "Présentiel" : "On-site"}</strong><span>{draft.category === "remote" || draft.category === "absence" || draft.location.toLowerCase().includes("erg") || draft.labelFr.toLowerCase().includes("erg") ? (language === "fr" ? "Ce type ne compte pas comme présentiel." : "This type does not count as on-site.") : (language === "fr" ? "Ce type compte comme présentiel." : "This type counts as on-site.")}</span></section>
      <footer className="pc12-footer"><button className="pc12-button" onClick={() => setDraft(emptyAssignmentDraft(state))}>{language === "fr" ? "Annuler" : "Cancel"}</button><button className="pc12-button primary" disabled={!draft.labelFr.trim() || !draft.teamId || !draft.activeWeekdays.length} onClick={save}>{editing ? (language === "fr" ? "Enregistrer" : "Save") : (language === "fr" ? "Créer le type" : "Create type")}</button></footer>
    </section>
  </section>;
}

function WeeklyPlanner({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [editing, setEditing] = useState<{ assignmentId: string; weekday: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const activeAssignments = state.assignments;
  const activeEmployees = state.employees.filter((employee) => employee.active);

  const open = (assignmentId: string, weekday: number) => {
    setEditing({ assignmentId, weekday });
    setSelected([...(weeklySlot(state, assignmentId, weekday)?.employeeIds ?? [])]);
  };

  const save = () => {
    if (!editing) return;
    const remaining = state.cycleSlots.filter((slot) => !(slot.assignmentId === editing.assignmentId && slot.weekday === editing.weekday));
    const shared = { assignmentId: editing.assignmentId, weekday: editing.weekday, employeeIds: selected };
    onState({ ...state, cycleSlots: [...remaining, { ...shared, cycle: "A" }, { ...shared, cycle: "B" }] });
    setEditing(null);
  };

  return <section className="pc12-card pc12-planner">
    {!activeAssignments.length ? <div className="pc12-empty"><strong>{language === "fr" ? "Crée d’abord un type d’affectation" : "Create an assignment type first"}</strong><span>{language === "fr" ? "Va dans l’onglet Types d’affectation." : "Go to Assignment types."}</span></div> : <div className="pc12-plan-grid">
      <div className="pc12-plan-head"><div>{language === "fr" ? "Affectation" : "Assignment"}</div>{WEEKDAYS.map((day) => <div key={day.value}>{day[language]}</div>)}</div>
      {activeAssignments.map((assignment) => <div className="pc12-plan-row" key={assignment.id}>
        <div className="pc12-plan-label"><strong>{assignmentIcon(assignment)} {assignmentLabel(assignment, language, true)}</strong><small>{assignment.timeLabel || assignment.location || CATEGORY_LABELS[assignment.category][language]}</small></div>
        {WEEKDAYS.map((day) => {
          const active = !assignment.activeWeekdays?.length || assignment.activeWeekdays.includes(day.value);
          const ids = weeklySlot(state, assignment.id, day.value)?.employeeIds ?? [];
          return <div className={`pc12-plan-cell ${active ? "" : "inactive"}`} key={day.value}>{active && <>{ids.map((id) => <span className="pc12-chip" key={id}>{state.employees.find((employee) => employee.id === id)?.displayName ?? id}</span>)}<button onClick={() => open(assignment.id, day.value)}>+ {language === "fr" ? "Affecter" : "Assign"}</button></>}</div>;
        })}
      </div>)}
    </div>}

    {editing && <div className="pc12-modal-backdrop" onMouseDown={() => setEditing(null)}><section className="pc12-modal" onMouseDown={(event) => event.stopPropagation()}><h2>{language === "fr" ? "Affecter les employés" : "Assign employees"}</h2><p>{assignmentLabel(state.assignments.find((item) => item.id === editing.assignmentId)!, language)} · {WEEKDAYS.find((day) => day.value === editing.weekday)?.[language]}</p><div className="pc12-checklist">{activeEmployees.map((employee) => <label key={employee.id}><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => setSelected((current) => current.includes(employee.id) ? current.filter((id) => id !== employee.id) : [...current, employee.id])} /><span>{employee.displayName}</span></label>)}</div><footer className="pc12-footer"><button className="pc12-button" onClick={() => setEditing(null)}>{language === "fr" ? "Annuler" : "Cancel"}</button><button className="pc12-button primary" onClick={save}>{language === "fr" ? "Enregistrer" : "Save"}</button></footer></section></div>}
  </section>;
}

function TeamAdmin({ state, onState, language }: { state: AppState; onState: (state: AppState) => void; language: Language }) {
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [teamId, setTeamId] = useState(state.teams[0]?.id ?? "main");
  const [newTeamName, setNewTeamName] = useState("");

  const addEmployee = () => {
    if (!name.trim()) return;
    const words = name.trim().split(/\s+/);
    const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
    const employee: Employee = { id: `employee-${Date.now()}`, displayName: name.trim(), initials: initials || "EM", jobTitle: jobTitle.trim() || (language === "fr" ? "Employé" : "Employee"), teamId, role: "employee", active: true };
    onState({ ...state, employees: [...state.employees, employee] });
    setName(""); setJobTitle("");
  };

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    const id = `team-${Date.now()}`;
    onState({ ...state, teams: [...state.teams, { id, name: newTeamName.trim(), active: true }] });
    setNewTeamName(""); setTeamId(id);
  };

  return <section className="pc12-grid2">
    <section className="pc12-card pc12-section"><h2>{language === "fr" ? "Ajouter un employé" : "Add employee"}</h2><label className="pc12-field">{language === "fr" ? "Nom" : "Name"}<input className="pc12-input" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="pc12-field">{language === "fr" ? "Titre d’emploi" : "Job title"}<input className="pc12-input" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></label><label className="pc12-field">{language === "fr" ? "Équipe" : "Team"}<select className="pc12-select" value={teamId} onChange={(event) => setTeamId(event.target.value)}>{state.teams.filter((team) => team.active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><button className="pc12-button primary" disabled={!name.trim()} onClick={addEmployee}>+ {language === "fr" ? "Ajouter" : "Add"}</button><hr /><h2>{language === "fr" ? "Nouvelle équipe" : "New team"}</h2><div className="pc12-outlook"><input className="pc12-input" value={newTeamName} onChange={(event) => setNewTeamName(event.target.value)} /><button className="pc12-button" disabled={!newTeamName.trim()} onClick={addTeam}>+ {language === "fr" ? "Créer" : "Create"}</button></div></section>
    <section className="pc12-card pc12-people"><h2>{language === "fr" ? "Employés" : "Employees"}</h2>{state.employees.map((employee) => <div className="pc12-person" key={employee.id}><span className="pc12-avatar">{employee.initials}</span><div className="grow"><strong>{employee.displayName}</strong><small>{employee.jobTitle} · {state.teams.find((team) => team.id === employee.teamId)?.name}</small></div><button className="pc12-button" onClick={() => onState({ ...state, employees: state.employees.map((item) => item.id === employee.id ? { ...item, active: !item.active } : item) })}>{employee.active ? (language === "fr" ? "Désactiver" : "Deactivate") : (language === "fr" ? "Activer" : "Activate")}</button></div>)}</section>
  </section>;
}
