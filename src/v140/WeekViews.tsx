import { addDays, formatWeekRange, startOfWeek, toDateKey } from "../dateUtils";
import type { AppState, AssignmentDefinition, Employee, Language, ScheduleRequest } from "../types";
import { accessLevel, approvedRequests, assignmentCategoryLabel, assignmentColor, assignmentIcon, assignmentLabel, assignmentsForEmployee, presenceStatus, presenceText, requestLabel, requiredOnSite, rotationLabel } from "./model";
import type { CalendarConfig } from "./model";

function AssignmentChip({ assignment, language }: { assignment: AssignmentDefinition; language: Language }) {
  const color = assignmentColor(assignment);
  return <div className="pc140-assignment-chip" style={{ borderLeftColor: color, backgroundColor: `${color}18` }}>
    <div className="pc140-assignment-title"><span className="pc140-color-dot" style={{ backgroundColor: color }} /><b>{assignmentLabel(assignment, language, true)}</b></div>
    <span className="pc140-category-badge">{assignmentIcon(assignment)} {assignmentCategoryLabel(assignment, language)}</span>
    {assignment.timeLabel && <small>{assignment.timeLabel}</small>}
    {assignment.location && <small>{assignment.location}</small>}
  </div>;
}

export function WeekToolbar({ title, weekStart, language, onWeek, config }: { title: string; weekStart: Date; language: Language; onWeek: (date: Date) => void; config: CalendarConfig }) {
  return <section className="pc131-card pc131-toolbar">
    <div className="pc131-inline"><button className="pc131-button" onClick={() => onWeek(addDays(weekStart, -7))}>‹</button><button className="pc131-button" onClick={() => onWeek(startOfWeek(new Date()))}>{language === "fr" ? "Aujourd’hui" : "Today"}</button><button className="pc131-button" onClick={() => onWeek(addDays(weekStart, 7))}>›</button></div>
    <div className="center"><h1>{title}</h1><p>{formatWeekRange(weekStart, language)}</p><span className="pc140-rotation-badge">{rotationLabel(config, weekStart, language)}</span></div><div />
  </section>;
}

export function WeekView({ state, config, weekStart, weekdays, employee, onWeek }: { state: AppState; config: CalendarConfig; weekStart: Date; weekdays: Date[]; employee?: Employee; onWeek: (date: Date) => void }) {
  const language = state.organization.language;
  const activeEmployees = state.employees.filter((item) => item.active);
  if (!employee) return <main className="pc131-main"><Empty title={language === "fr" ? "Aucun employé actif" : "No active employees"} /></main>;
  return <main className="pc131-main">
    <WeekToolbar title={language === "fr" ? "Mon horaire de la semaine" : "My weekly schedule"} weekStart={weekStart} language={language} onWeek={onWeek} config={config} />
    <section className="pc131-week">{weekdays.map((date) => {
      const dateKey = toDateKey(date);
      const status = presenceStatus(state, config, employee, date);
      const requests = approvedRequests(state, employee.id, date);
      const assignments = assignmentsForEmployee(state, config, employee.id, date);
      const events = config.events.filter((event) => event.date === dateKey);
      const coverage = requiredOnSite(config, date);
      const present = activeEmployees.filter((person) => presenceStatus(state, config, person, date) === "onsite").length;
      return <article className="pc131-day" key={dateKey}>
        <header><div><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long" })}</strong><small>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" })}</small></div><span className={`pc131-status ${status}`}>{status === "onsite" ? "🏢" : status === "remote" ? "🏠" : "🌴"} {presenceText(status, language)}</span></header>
        <div className="pc131-day-body">
          {requests.map((request: ScheduleRequest) => <div className="pc131-item" key={request.id}><span>{request.type === "remote" ? "🏠" : "🌴"}</span><div><b>{requestLabel(request, language)}</b>{request.note && <small>{request.note}</small>}</div></div>)}
          {assignments.map((assignment) => <AssignmentChip key={assignment.id} assignment={assignment} language={language} />)}
          {events.map((event) => <div className="pc131-item event" key={event.id}><span>📌</span><div><b>{event.title}</b><small>{event.startTime || "09:00"}–{event.endTime || "10:00"}</small></div></div>)}
          {!requests.length && !assignments.length && !events.length && <div className="pc131-default">🏢 {language === "fr" ? "Présentiel — aucune exception" : "On-site — no exception"}</div>}
        </div>
        <footer className={present >= coverage.required ? "good" : "bad"}><span>{language === "fr" ? "Présents" : "On-site"}: <b>{present}</b></span><span>Minimum: <b>{coverage.required}</b></span>{coverage.peak > 1 && <span>{coverage.peak} {language === "fr" ? "évén. simult." : "overlapping"}</span>}<strong>{present >= coverage.required ? "✓" : "⚠"}</strong></footer>
      </article>;
    })}</section>
    <section className="pc131-card pc131-rule"><strong>🏢 {language === "fr" ? "Règle de présence" : "Presence rule"}</strong><span>{language === "fr" ? "Un employé est présentiel par défaut. Congé, autre absence, télétravail ou affectation À distance le retire du calcul présentiel." : "Employees are on-site by default. Leave, other absence, remote work or a Remote assignment removes them from on-site coverage."}</span></section>
  </main>;
}

export function TeamOverview({ state, config, weekStart, weekdays, onWeek }: { state: AppState; config: CalendarConfig; weekStart: Date; weekdays: Date[]; onWeek: (date: Date) => void }) {
  const language = state.organization.language;
  const employees = state.employees.filter((employee) => employee.active);
  return <main className="pc131-main">
    <WeekToolbar title={language === "fr" ? "Vue d’ensemble de l’équipe" : "Team overview"} weekStart={weekStart} language={language} onWeek={onWeek} config={config} />
    <section className="pc131-card pc131-team-overview">
      <div className="pc131-overview-grid header"><div>{language === "fr" ? "Membre" : "Member"}</div>{weekdays.map((date) => <div key={toDateKey(date)}><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "short" })}</strong><small>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short" })}</small></div>)}</div>
      {employees.map((employee) => <div className="pc131-overview-grid row" key={employee.id}><div className="member"><span className="avatar">{employee.initials}</span><div><strong>{employee.displayName}</strong><small>{accessLevel(employee.role) === "admin" ? "Admin" : (language === "fr" ? "Employé" : "Employee")}</small></div></div>{weekdays.map((date) => {
        const status = presenceStatus(state, config, employee, date);
        const items = assignmentsForEmployee(state, config, employee.id, date);
        return <div className="pc131-person-day" key={toDateKey(date)}><span className={`pc131-status ${status}`}>{status === "onsite" ? "🏢" : status === "remote" ? "🏠" : "🌴"} {presenceText(status, language)}</span>{items.slice(0, 3).map((item) => <div className="pc140-overview-assignment" key={item.id} style={{ borderLeftColor: assignmentColor(item), backgroundColor: `${assignmentColor(item)}16` }}><strong>{assignmentLabel(item, language, true)}</strong><small>{assignmentCategoryLabel(item, language)}</small></div>)}</div>;
      })}</div>)}
      {!employees.length && <Empty title={language === "fr" ? "Aucun membre dans l’équipe" : "No team members"} />}
    </section>
    <section className="pc131-coverage-strip">{weekdays.map((date) => {
      const coverage = requiredOnSite(config, date);
      const present = employees.filter((employee) => presenceStatus(state, config, employee, date) === "onsite").length;
      return <article className={present >= coverage.required ? "good" : "bad"} key={toDateKey(date)}><strong>{date.toLocaleDateString(language === "fr" ? "fr-CA" : "en-CA", { weekday: "long" })}</strong><span>{language === "fr" ? "Présentiel" : "On-site"}: {present} / {coverage.required}</span>{coverage.peak > 1 && <small>{coverage.peak} {language === "fr" ? "événements simultanés" : "overlapping events"}</small>}</article>;
    })}</section>
  </main>;
}

function Empty({ title }: { title: string }) { return <div className="pc131-empty"><span>📭</span><strong>{title}</strong></div>; }
