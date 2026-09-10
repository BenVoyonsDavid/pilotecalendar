import { useEffect, useMemo, useState } from "react";
import "./PiloteCalendarV131.css";
import "./PiloteCalendarV140.css";
import { saveServerState } from "./backend";
import { addDays, startOfWeek } from "./dateUtils";
import type { AppState } from "./types";
import type { TeamsContextInfo } from "./teams";
import { Administration, CalendarView, RequestsView } from "./v140/AdminViews";
import { TeamOverview, WeekView } from "./v140/WeekViews";
import { CONFIG_KEY, isAdmin, readConfig, readState, STORAGE_KEY } from "./v140/model";
import type { CalendarConfig } from "./v140/model";

type View = "week" | "team" | "requests" | "calendar" | "admin";

export default function PiloteCalendarV140({ teamsContext }: { teamsContext?: TeamsContextInfo }) {
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
      <div className="pc131-brand"><span>📅</span><div><strong>PiloteCalendar</strong><small>v1.4.0</small></div></div>
      <nav className="pc131-nav">
        <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>📆 {language === "fr" ? "Ma semaine" : "My week"}</button>
        <button className={view === "team" ? "active" : ""} onClick={() => setView("team")}>👥 {language === "fr" ? "Équipe" : "Team"}</button>
        <button className={view === "requests" ? "active" : ""} onClick={() => setView("requests")}>📝 {language === "fr" ? "Demandes" : "Requests"}</button>
        {admin && <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>🗓️ {language === "fr" ? "Calendrier central" : "Central calendar"}</button>}
        {admin && <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>⚙️ Administration</button>}
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
    {view === "admin" && admin && <Administration state={state} onState={persistState} config={config} onConfig={setConfig} language={language} />}
  </div>;
}
