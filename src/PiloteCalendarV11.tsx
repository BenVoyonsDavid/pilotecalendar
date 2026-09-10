import { useEffect, useMemo, useState } from "react";
import App from "./App";
import "./PiloteCalendarV11.css";
import { addDays, cycleForWeek, dateInRange, formatLongDate, formatWeekRange, startOfWeek, toDateKey } from "./dateUtils";
import { createBlankCompanyState } from "./sampleData";
import type { AppState, AssignmentDefinition, CycleType, Employee, Language, ScheduleRequest } from "./types";
import type { TeamsContextInfo } from "./teams";

type ShellView = "myWeek" | "centralCalendar" | "management";

type OperationalEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  minimumOnSite: number;
};

type V11Config = {
  outlookCalendarUrl: string;
  defaultMinimumOnSite: number;
  events: OperationalEvent[];
};

type PresenceStatus = "onsite" | "remote" | "leave" | "erg";

const APP_STORAGE_KEY = "horaireTeams.v1";
const CONFIG_STORAGE_KEY = "pilotecalendar.v1.1.config";

const defaultConfig: V11Config = {
  outlookCalendarUrl: "https://outlook.office.com/calendar/view/week",
  defaultMinimumOnSite: 1,
  events: []
};

function readAppState(): AppState {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.organization?.isDemo) return parsed;
      localStorage.removeItem(APP_STORAGE_KEY);
    }
  } catch {
    // Start clean if old prototype data cannot be read.
  }
  return createBlankCompanyState("fr", "free", "Mon organisation");
}

function readConfig(): V11Config {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<V11Config>;
      return {
        outlookCalendarUrl: parsed.outlookCalendarUrl || defaultConfig.outlookCalendarUrl,
        defaultMinimumOnSite: Math.max(0, Number(parsed.defaultMinimumOnSite ?? 1)),
        events: Array.isArray(parsed.events) ? parsed.events : []
      };
    }
  } catch {
    // Use defaults.
  }
  return defaultConfig;
}

function assignmentLabel(assignment: AssignmentDefinition, language: Language) {
  return language === "fr" ? assignment.shortLabelFr || assignment.labelFr : assignment.shortLabelEn || assignment.labelEn;
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

function isErgAssignment(assignment: AssignmentDefinition) {
  const value = [assignment.id, assignment.location, assignment.labelFr, assignment.labelEn, assignment.shortLabelFr, assignment.shortLabelEn]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return value.includes("erg");
}

function effectiveAssignments(state: AppState, employeeId: string, date: Date) {
  const dateKey = toDateKey(date);
  const cycle: CycleType = state.organization.planId === "free" ? "A" : cycleForWeek(startOfWeek(date));
  return state.assignments.filter((assignment) => {
    if (assignment.activeWeekdays && !assignment.activeWeekdays.includes(date.getDay())) return false;
    const exception = state.exceptions.find((item) => item.assignmentId === assignment.id && item.date === dateKey);
    const base = state.cycleSlots.find((item) => item.cycle === cycle && item.assignmentId === assignment.id && item.weekday === date.getDay());
    return (exception?.employeeIds ?? base?.employeeIds ?? []).includes(employeeId);
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

  const assignments = effectiveAssignments(state, employee.id, date);
  if (assignments.some((assignment) => assignment.category === "remote")) return "remote";
  if (assignments.some(isErgAssignment)) return "erg";

  // Business rule requested for PiloteCalendar:
  // unless the employee is on leave, remote work or ERG, they count as on-site.
  return "onsite";
}

function statusText(status: PresenceStatus, language: Language) {
  if (language === "fr") {
    return status === "onsite" ? "Présentiel" : status === "remote" ? "Télétravail" : status === "erg" ? "ERG" : "Congé / absence";
  }
  return status === "onsite" ? "On-site" : status === "remote" ? "Remote" : status === "erg" ? "ERG" : "Leave / absence";
}

function statusIcon(status: PresenceStatus) {
  return status === "onsite" ? "🏢" : status === "remote" ? "🏠" : status === "erg" ? "📍" : "🌴";
}

export default function PiloteCalendarV11({ teamsContext }: { teamsContext?: TeamsContextInfo }) {
  const [shellView, setShellView] = useState<ShellView>("myWeek");
  const [state, setState] = useState<AppState>(() => readAppState());
  const [config, setConfig] = useState<V11Config>(() => readConfig());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  useEffect(() => {
    // Remove the old packaged demo from the public app if it is still cached.
    try {
      const raw = localStorage.getItem(APP_STORAGE_KEY);
      if (raw && (JSON.parse(raw) as AppState).organization?.isDemo) localStorage.removeItem(APP_STORAGE_KEY);
      for (const key of ["horaireTeams.v1rc1", "horaireTeams.v0.5", "horaireTeams.v0.4"]) localStorage.removeItem(key);
    } catch {
      // Ignore malformed legacy data.
    }
    setState(readAppState());
  }, []);

  useEffect(() => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const employees = state.employees.filter((employee) => employee.active);
    const teamsMatch = teamsContext?.userId ? employees.find((employee) => employee.microsoftUserId === teamsContext.userId) : undefined;
    if (teamsMatch) setSelectedEmployeeId(teamsMatch.id);
    else if (!selectedEmployeeId || !employees.some((employee) => employee.id === selectedEmployeeId)) setSelectedEmployeeId(employees[0]?.id ?? "");
  }, [teamsContext?.userId, state.employees, selectedEmployeeId]);

  const refreshState = () => setState(readAppState());
  const language = state.organization.language;
  const selectedEmployee = state.employees.find((employee) => employee.id === selectedEmployeeId) ?? state.employees.find((employee) => employee.active);
  const weekdays = useMemo(() => [0, 1, 2, 3, 4].map((offset) => addDays(weekStart, offset)), [weekStart]);

  const changeView = (view: ShellView) => {
    if (view !== "management") refreshState();
    setShellView(view);
  };

  return (
    <div className="v11-shell">
      <div className="v11-product-bar">
        <div className="v11-brand">
          <span className="v11-brand-icon">📅</span>
          <div><strong>PiloteCalendar</strong><small>v1.1.0</small></div>
        </div>
        <nav className="v11-primary-nav">
          <button className={shellView === "myWeek" ? "active" : ""} onClick={() => changeView("myWeek")}>📆 {language === "fr" ? "Ma semaine" : "My week"}</button>
          <button className={shellView === "centralCalendar" ? "active" : ""} onClick={() => changeView("centralCalendar")}>🗓️ {language === "fr" ? "Calendrier central" : "Central calendar"}</button>
          <button className={shellView === "management" ? "active" : ""} onClick={() => changeView("management")}>⚙️ {language === "fr" ? "Gestion" : "Management"}</button>
        </nav>
      </div>

      {shellView === "myWeek" && (
        <MyWeekView
          state={state}
          config={config}
          weekStart={weekStart}
          weekdays={weekdays}
          selectedEmployee={selectedEmployee}
          selectedEmployeeId={selectedEmployeeId}
          onEmployee={setSelectedEmployeeId}
          onPrevious={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
        />
      )}

      {shellView === "centralCalendar" && (
        <CentralCalendarView state={state} config={config} onConfig={setConfig} />
      )}

      {shellView === "management" && <App teamsContext={teamsContext} />}
    </div>
  );
}

function MyWeekView({ state, config, weekStart, weekdays, selectedEmployee, selectedEmployeeId, onEmployee, onPrevious, onNext, onToday }: {
  state: AppState;
  config: V11Config;
  weekStart: Date;
  weekdays: Date[];
  selectedEmployee?: Employee;
  selectedEmployeeId: string;
  onEmployee: (id: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const language = state.organization.language;
  if (!selectedEmployee) {
    return <main className="v11-page"><div className="v11-empty"><span>👤</span><h2>{language === "fr" ? "Ajoute d’abord tes employés" : "Add employees first"}</h2><p>{language === "fr" ? "Va dans Gestion → Équipes et permissions pour créer l’équipe." : "Go to Management → Teams & permissions to create the team."}</p></div></main>;
  }

  const teamEmployees = state.employees.filter((employee) => employee.active && employee.teamId === selectedEmployee.teamId);

  return <main className="v11-page">
    <section className="myweek-toolbar">
      <div className="myweek-nav-buttons"><button onClick={onPrevious}>‹</button><button className="today" onClick={onToday}>{language === "fr" ? "Aujourd’hui" : "Today"}</button><button onClick={onNext}>›</button></div>
      <div className="myweek-title"><h1>{language === "fr" ? "Mon horaire de la semaine" : "My weekly schedule"}</h1><span>{formatWeekRange(weekStart, language)}</span></div>
      <label>{language === "fr" ? "Afficher" : "Show"}<select value={selectedEmployeeId} onChange={(event) => onEmployee(event.target.value)}>{state.employees.filter((employee) => employee.active).map((employee) => <option key={employee.id} value={employee.id}>{employee.displayName}</option>)}</select></label>
    </section>

    <section className="weekly-summary-grid">
      {weekdays.map((date) => {
        const dateKey = toDateKey(date);
        const status = presenceStatus(state, selectedEmployee, date);
        const assignments = effectiveAssignments(state, selectedEmployee.id, date);
        const requests = approvedRequests(state, selectedEmployee.id, date);
        const events = config.events.filter((event) => event.date === dateKey);
        const required = Math.max(config.defaultMinimumOnSite, ...events.map((event) => event.minimumOnSite), 0);
        const present = teamEmployees.filter((employee) => presenceStatus(state, employee, date) === "onsite").length;
        const covered = present >= required;
        return <article className={`week-day-card status-${status}`} key={dateKey}>
          <header><div><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long" })}</strong><span>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" })}</span></div><span className={`presence-pill ${status}`}>{statusIcon(status)} {statusText(status, language)}</span></header>
          <div className="day-card-body">
            {requests.map((request) => <div className="week-item request" key={request.id}><span>{request.type === "remote" ? "🏠" : "🌴"}</span><div><b>{requestLabel(request, language)}</b>{request.note && <small>{request.note}</small>}</div></div>)}
            {assignments.map((assignment) => <div className="week-item assignment" key={assignment.id}><span>{assignment.category === "classes" ? "🎓" : assignment.category === "remote" ? "🏠" : isErgAssignment(assignment) ? "📍" : "•"}</span><div><b>{assignmentLabel(assignment, language)}</b>{assignment.timeLabel && <small>{assignment.timeLabel}</small>}{assignment.location && <small>{assignment.location}</small>}</div></div>)}
            {!requests.length && !assignments.length && <div className="default-presence"><span>🏢</span><div><b>{language === "fr" ? "Présentiel" : "On-site"}</b><small>{language === "fr" ? "Aucune exception à l’horaire" : "No schedule exception"}</small></div></div>}
            {events.length > 0 && <div className="events-block"><strong>{language === "fr" ? "Événements" : "Events"}</strong>{events.map((event) => <div key={event.id}><span>📌 {event.title}{event.time ? ` · ${event.time}` : ""}</span><small>{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}: {event.minimumOnSite}</small></div>)}</div>}
          </div>
          <footer className={covered ? "coverage-ok" : "coverage-warning"}><span>{language === "fr" ? "Présents" : "On-site"} <b>{present}</b></span><span>{language === "fr" ? "Minimum" : "Minimum"} <b>{required}</b></span><strong>{covered ? "✓" : "⚠"}</strong></footer>
        </article>;
      })}
    </section>

    <section className="presence-rule-note"><strong>🏢 {language === "fr" ? "Règle de présence" : "Presence rule"}</strong><span>{language === "fr" ? "Tout employé actif est considéré présentiel, sauf s’il est en congé/absence, en télétravail ou affecté à ERG." : "Every active employee counts as on-site unless on leave, remote work, or assigned to ERG."}</span></section>
  </main>;
}

function CentralCalendarView({ state, config, onConfig }: { state: AppState; config: V11Config; onConfig: (config: V11Config) => void }) {
  const language = state.organization.language;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toDateKey(new Date()));
  const [time, setTime] = useState("");
  const [minimum, setMinimum] = useState(config.defaultMinimumOnSite);

  const addEvent = () => {
    if (!title.trim() || !date) return;
    const event: OperationalEvent = { id: `event-${Date.now()}`, title: title.trim(), date, time: time || undefined, minimumOnSite: Math.max(0, Number(minimum) || 0) };
    onConfig({ ...config, events: [...config.events, event].sort((a, b) => `${a.date}${a.time || ""}`.localeCompare(`${b.date}${b.time || ""}`)) });
    setTitle("");
    setTime("");
  };

  const openOutlook = () => {
    const url = config.outlookCalendarUrl.trim() || defaultConfig.outlookCalendarUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return <main className="v11-page central-calendar-page">
    <section className="central-card outlook-card">
      <div><p className="v11-kicker">Microsoft 365</p><h2>Outlook</h2><p>{language === "fr" ? "Enregistre ici le lien de ton calendrier Outlook partagé (ex. CATI). Le bouton l’ouvrira directement depuis PiloteCalendar." : "Save the link to your shared Outlook calendar here."}</p></div>
      <label>{language === "fr" ? "Lien du calendrier Outlook" : "Outlook calendar link"}<input value={config.outlookCalendarUrl} onChange={(event) => onConfig({ ...config, outlookCalendarUrl: event.target.value })} placeholder="https://outlook.office.com/..." /></label>
      <button className="v11-primary-button" onClick={openOutlook}>↗ {language === "fr" ? "Ouvrir Outlook" : "Open Outlook"}</button>
      <small className="v11-help">{language === "fr" ? "Cette version ouvre Outlook. La synchronisation automatique des événements nécessitera Microsoft Graph/Entra." : "This version opens Outlook. Automatic event sync will require Microsoft Graph/Entra."}</small>
    </section>

    <section className="central-card">
      <div className="central-heading"><div><p className="v11-kicker">{language === "fr" ? "Couverture" : "Coverage"}</p><h2>{language === "fr" ? "Minimum de personnes en présentiel" : "Minimum on-site staff"}</h2></div><label className="minimum-input">{language === "fr" ? "Minimum par défaut" : "Default minimum"}<input type="number" min="0" value={config.defaultMinimumOnSite} onChange={(event) => onConfig({ ...config, defaultMinimumOnSite: Math.max(0, Number(event.target.value) || 0) })} /></label></div>
      <p>{language === "fr" ? "Un événement peut augmenter le minimum requis pour sa journée. PiloteCalendar applique automatiquement le plus grand minimum entre la règle générale et les événements du jour." : "An event can increase the required minimum for its day. PiloteCalendar automatically uses the highest requirement."}</p>

      <div className="event-form">
        <label>{language === "fr" ? "Événement" : "Event"}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={language === "fr" ? "Ex. Journée d’accueil" : "E.g. Welcome day"} /></label>
        <label>{language === "fr" ? "Date" : "Date"}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>{language === "fr" ? "Heure" : "Time"}<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label>{language === "fr" ? "Minimum présentiel" : "Minimum on-site"}<input type="number" min="0" value={minimum} onChange={(event) => setMinimum(Math.max(0, Number(event.target.value) || 0))} /></label>
        <button className="v11-primary-button" disabled={!title.trim()} onClick={addEvent}>+ {language === "fr" ? "Ajouter" : "Add"}</button>
      </div>

      <div className="event-list">
        {config.events.length ? config.events.map((event) => <article key={event.id}><div><strong>{event.title}</strong><span>{formatLongDate(new Date(`${event.date}T12:00:00`), language)}{event.time ? ` · ${event.time}` : ""}</span></div><span className="minimum-badge">🏢 {event.minimumOnSite}</span><button onClick={() => onConfig({ ...config, events: config.events.filter((item) => item.id !== event.id) })}>×</button></article>) : <div className="v11-empty small"><span>📭</span><p>{language === "fr" ? "Aucun événement configuré." : "No events configured."}</p></div>}
      </div>
    </section>
  </main>;
}
