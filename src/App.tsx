import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { createBlankCompanyState, initialState, makeDefaultNotification } from "./sampleData";
import { t } from "./i18n";
import type { AppState, AssignmentDefinition, AssignmentException, CycleType, DailyBriefSetting, Employee, Language, NotificationLanguage, PlanId, RequestStatus, RequestType, ScheduleRequest, UserRole } from "./types";
import { addDays, addWeeks, cycleForWeek, dateInRange, formatDayHeader, formatLongDate, formatWeekRange, isToday, startOfWeek, toDateKey } from "./dateUtils";
import { bindTeam, loadServerState, saveServerState, sendBriefNow } from "./backend";
import type { TeamsContextInfo } from "./teams";

const STORAGE_KEY = "horaireTeams.v1";
const PREVIOUS_STORAGE_KEYS = ["horaireTeams.v1rc1", "horaireTeams.v0.5", "horaireTeams.v0.4"];
type ViewMode = "assignments" | "employees" | "requests" | "notifications" | "team" | "organization" | "plans";
type CycleMode = "auto" | "A" | "B";

const PLAN_CONFIG = {
  free: { maxEmployees: 5, maxTeams: 1, approvals: false, managers: false, cycleAB: false, advancedPermissions: false, integrations: false, dailyBrief: false },
  team: { maxEmployees: 30, maxTeams: 5, approvals: true, managers: true, cycleAB: true, advancedPermissions: false, integrations: true, dailyBrief: true },
  business: { maxEmployees: Infinity, maxTeams: Infinity, approvals: true, managers: true, cycleAB: true, advancedPermissions: true, integrations: true, dailyBrief: true }
} as const;

const categoryIcon: Record<AssignmentDefinition["category"], string> = {
  classes: "🎓", remote: "🏠", site: "📍", escalation: "📞", absence: "⛔", other: "•"
};
const requestIcon: Record<RequestType, string> = { vacation: "🌴", absence: "⛔", remote: "🏠" };

function normalizeState(value: AppState): AppState {
  const notifications = value.notifications?.length
    ? value.notifications
    : value.teams.map((team) => makeDefaultNotification(team.id));
  return { ...value, notifications };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw) as AppState);
    for (const key of PREVIOUS_STORAGE_KEYS) {
      const previous = localStorage.getItem(key);
      if (previous) {
        const migrated = normalizeState(JSON.parse(previous) as AppState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch { /* prototype */ }
  return createBlankCompanyState("fr", "free", "Mon organisation");
}

const assignmentLabel = (a: AssignmentDefinition, language: Language, short = false) =>
  language === "fr" ? (short ? a.shortLabelFr : a.labelFr) : (short ? a.shortLabelEn : a.labelEn);

const roleRank: Record<UserRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 3, owner: 4 };

export default function App({ teamsContext }: { teamsContext?: TeamsContextInfo }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<ViewMode>("assignments");
  const [cycleMode, setCycleMode] = useState<CycleMode>("auto");
  const [editing, setEditing] = useState<{ assignmentId: string; date: string } | null>(null);
  const [requestEditor, setRequestEditor] = useState(false);
  const [employeeEditor, setEmployeeEditor] = useState(false);
  const [blankEditor, setBlankEditor] = useState(false);
  const [actingUserId, setActingUserId] = useState(() => state.employees[0]?.id ?? "");
  const [serverConnected, setServerConnected] = useState(false);

  useEffect(() => {
    void loadServerState().then((remote) => {
      if (remote) {
        setState(normalizeState(remote));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        setServerConnected(true);
      } else {
        void saveServerState(state).then(setServerConnected);
      }
    });
  }, []);

  useEffect(() => {
    if (!teamsContext?.userId) return;
    const match = state.employees.find((employee) => employee.microsoftUserId === teamsContext.userId);
    if (match) setActingUserId(match.id);
  }, [teamsContext?.userId, state.employees]);

  const language = state.organization.language;
  const plan = PLAN_CONFIG[state.organization.planId];
  const weekdays = useMemo(() => [0,1,2,3,4].map((i) => addDays(weekStart, i)), [weekStart]);
  const detectedCycle = cycleForWeek(weekStart);
  const cycle: CycleType = plan.cycleAB ? (cycleMode === "auto" ? detectedCycle : cycleMode) : "A";
  const employees = state.employees.filter((e) => e.active);
  const actingUser = state.employees.find((e) => e.id === actingUserId) ?? state.employees[0];

  const persist = (next: AppState) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    void saveServerState(next).then(setServerConnected);
  };

  const replaceState = (next: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    void saveServerState(next).then(setServerConnected);
    setState(next);
    setActingUserId(next.employees[0]?.id ?? "");
    setView("assignments");
  };

  const canManageTeam = (teamId: string) => {
    if (!actingUser) return false;
    if (actingUser.role === "owner" || actingUser.role === "admin") return true;
    return plan.managers && actingUser.role === "manager" && actingUser.teamId === teamId;
  };
  const canManageAssignment = (assignment: AssignmentDefinition) => canManageTeam(assignment.teamId);
  const canReviewEmployee = (employeeId: string) => {
    const employee = state.employees.find((e) => e.id === employeeId);
    return !!employee && plan.approvals && canManageTeam(employee.teamId);
  };

  const baseSlot = (assignmentId: string, weekday: number) =>
    state.cycleSlots.find((s) => s.cycle === cycle && s.assignmentId === assignmentId && s.weekday === weekday);
  const exception = (assignmentId: string, date: string) =>
    state.exceptions.find((e) => e.assignmentId === assignmentId && e.date === date);
  const effectiveSlot = (assignmentId: string, date: Date) => {
    const dateKey = toDateKey(date);
    const ex = exception(assignmentId, dateKey);
    if (ex) return { employeeIds: ex.employeeIds, note: ex.note, isException: true };
    const slot = baseSlot(assignmentId, date.getDay());
    return { employeeIds: slot?.employeeIds ?? [], note: slot?.note, isException: false };
  };
  const availabilityFor = (employeeId: string, date: Date) =>
    state.requests.filter((r) => r.employeeId === employeeId && r.status === "approved" && dateInRange(date, r.startDate, r.endDate));

  const saveException = (value: AssignmentException) => persist({ ...state, exceptions: [...state.exceptions.filter((e) => !(e.date === value.date && e.assignmentId === value.assignmentId)), value] });
  const removeException = (assignmentId: string, date: string) => persist({ ...state, exceptions: state.exceptions.filter((e) => !(e.assignmentId === assignmentId && e.date === date)) });

  const setLanguage = (nextLanguage: Language) => persist({ ...state, organization: { ...state.organization, language: nextLanguage } });
  const setPlan = (planId: PlanId) => persist({ ...state, organization: { ...state.organization, planId } });

  const updateRequest = (id: string, status: RequestStatus) => persist({ ...state, requests: state.requests.map((r) => r.id === id ? { ...r, status, reviewedBy: actingUser?.id } : r) });

  const tabs: { id: ViewMode; label: string }[] = [
    { id: "assignments", label: t(language, "assignments") },
    { id: "employees", label: t(language, "employees") },
    { id: "requests", label: t(language, "requests") },
    { id: "notifications", label: t(language, "notifications") },
    { id: "team", label: t(language, "team") },
    { id: "organization", label: t(language, "organization") },
    { id: "plans", label: t(language, "plans") }
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">v1.0.0 · {serverConnected ? (language === "fr" ? "Serveur connecté" : "Server connected") : (language === "fr" ? "Mode local" : "Local mode")}</p>
          <h1>{state.organization.name}</h1>
          <p className="subtitle">{t(language, "subtitle")}</p>
        </div>
        <div className="top-actions wrap-actions">
          {(!teamsContext?.inTeams || !teamsContext?.userId || !state.employees.some((e) => e.microsoftUserId === teamsContext.userId)) && <label className="compact-field">{t(language, "actingAs")}
            <select value={actingUser?.id ?? ""} onChange={(e) => setActingUserId(e.target.value)}>
              {state.employees.map((e) => <option key={e.id} value={e.id}>{e.displayName} · {roleLabel(language, e.role)}</option>)}
            </select>
          </label>}
          <button className="language-button" onClick={() => setLanguage(language === "fr" ? "en" : "fr")}>{language === "fr" ? "EN" : "FR"}</button>
          <span className={`plan-badge plan-${state.organization.planId}`}>{planLabel(language, state.organization.planId)}</span>
          {(view === "assignments" || view === "employees") && <span className={`cycle-badge cycle-${cycle.toLowerCase()}`}>{language === "fr" ? "Semaine" : "Week"} {cycle}</span>}
        </div>
      </header>

      <nav className="tabs">{tabs.map((tab) => <button key={tab.id} className={view === tab.id ? "active" : ""} onClick={() => setView(tab.id)}>{tab.label}</button>)}</nav>

      {(view === "assignments" || view === "employees") && (
        <section className="week-toolbar">
          <div className="nav-group">
            <button className="icon-button" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>‹</button>
            <button className="secondary-button" onClick={() => setWeekStart(startOfWeek(new Date()))}>{t(language, "today")}</button>
            <button className="icon-button" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>›</button>
          </div>
          <div className="week-title"><strong>{formatWeekRange(weekStart, language)}</strong><span>{t(language, "detectedCycle")} : {detectedCycle}</span></div>
          <label className="cycle-selector">{t(language, "cycle")}
            <select disabled={!plan.cycleAB} value={plan.cycleAB ? cycleMode : "A"} onChange={(e) => setCycleMode(e.target.value as CycleMode)}>
              {plan.cycleAB && <option value="auto">{t(language, "automatic")} ({detectedCycle})</option>}
              <option value="A">{plan.cycleAB ? t(language, "forceA") : "A"}</option>
              {plan.cycleAB && <option value="B">{t(language, "forceB")}</option>}
            </select>
          </label>
        </section>
      )}

      {view === "assignments" && <AssignmentView assignments={state.assignments} weekdays={weekdays} employees={employees} language={language} effectiveSlot={effectiveSlot} availabilityFor={availabilityFor} canEdit={canManageAssignment} onEdit={(assignmentId, date) => setEditing({ assignmentId, date })} />}
      {view === "employees" && <EmployeeView assignments={state.assignments} weekdays={weekdays} employees={employees} language={language} effectiveSlot={effectiveSlot} availabilityFor={availabilityFor} />}
      {view === "requests" && <RequestView state={state} language={language} actingUser={actingUser} approvals={plan.approvals} canReview={canReviewEmployee} onNew={() => setRequestEditor(true)} onStatus={updateRequest} />}
      {view === "notifications" && <NotificationsView state={state} language={language} enabledByPlan={plan.dailyBrief} canManageTeam={canManageTeam} onState={persist} teamsContext={teamsContext} />}
      {view === "team" && <TeamView state={state} language={language} plan={state.organization.planId} actingUser={actingUser} canManageTeam={canManageTeam} onAddEmployee={() => setEmployeeEditor(true)} onState={persist} />}
      {view === "organization" && <OrganizationView state={state} language={language} onState={persist} onPlan={setPlan} onBlank={() => setBlankEditor(true)} onDemo={() => replaceState({ ...initialState, organization: { ...initialState.organization, language } })} />}
      {view === "plans" && <PlansView language={language} current={state.organization.planId} onPlan={setPlan} />}

      {editing && (() => {
        const assignment = state.assignments.find((a) => a.id === editing.assignmentId);
        const date = new Date(`${editing.date}T12:00:00`);
        if (!assignment) return null;
        const slot = effectiveSlot(assignment.id, date);
        const editable = canManageAssignment(assignment);
        return <AssignmentEditor assignment={assignment} date={editing.date} language={language} employees={employees} selected={slot.employeeIds} note={slot.note ?? ""} isException={slot.isException} editable={editable} onClose={() => setEditing(null)} onSave={(employeeIds, note) => { saveException({ date: editing.date, assignmentId: assignment.id, employeeIds, note: note || undefined }); setEditing(null); }} onRevert={() => { removeException(assignment.id, editing.date); setEditing(null); }} />;
      })()}

      {requestEditor && <RequestEditor state={state} language={language} actingUser={actingUser} approvals={plan.approvals} canManageTeam={canManageTeam} onClose={() => setRequestEditor(false)} onSave={(request) => { persist({ ...state, requests: [...state.requests, request] }); setRequestEditor(false); }} />}
      {employeeEditor && <EmployeeEditor state={state} language={language} plan={state.organization.planId} onClose={() => setEmployeeEditor(false)} onSave={(employee) => { persist({ ...state, employees: [...state.employees, employee] }); setEmployeeEditor(false); }} />}
      {blankEditor && <BlankCompanyEditor language={language} onClose={() => setBlankEditor(false)} onCreate={(name, planId, lang) => { replaceState(createBlankCompanyState(lang, planId, name)); setBlankEditor(false); }} />}
    </div>
  );
}

function AssignmentView({ assignments, weekdays, employees, language, effectiveSlot, availabilityFor, canEdit, onEdit }: {
  assignments: AssignmentDefinition[]; weekdays: Date[]; employees: Employee[]; language: Language;
  effectiveSlot: (assignmentId: string, date: Date) => { employeeIds: string[]; note?: string; isException: boolean };
  availabilityFor: (employeeId: string, date: Date) => ScheduleRequest[];
  canEdit: (assignment: AssignmentDefinition) => boolean; onEdit: (assignmentId: string, date: string) => void;
}) {
  const byId = Object.fromEntries(employees.map((e) => [e.id, e]));
  if (!assignments.length) return <EmptyState icon="🗓️" title={t(language, "noAssignments")} description={t(language, "noAssignmentsHelp")} />;
  return <main className="schedule-card">
    <div className="assignment-grid header-row"><div className="assignment-header">{t(language, "assignment")}</div>{weekdays.map((date) => <div className={`day-header ${isToday(date) ? "today" : ""}`} key={toDateKey(date)}>{formatDayHeader(date, language)}</div>)}</div>
    {assignments.map((assignment) => <div className="assignment-grid assignment-row" key={assignment.id}>
      <div className="assignment-info"><span className={`category-icon cat-${assignment.category}`}>{categoryIcon[assignment.category]}</span><div><strong>{assignmentLabel(assignment, language, true)}</strong><span>{assignment.timeLabel || assignment.location || assignmentLabel(assignment, language)}</span></div></div>
      {weekdays.map((date) => {
        const active = !assignment.activeWeekdays || assignment.activeWeekdays.includes(date.getDay());
        const slot = effectiveSlot(assignment.id, date);
        const people = slot.employeeIds.map((id) => byId[id]).filter(Boolean);
        const conflicts = people.filter((p) => availabilityFor(p.id, date).some((r) => r.type !== "remote" || assignment.category !== "remote"));
        const coverageOk = assignment.minimumStaff === 0 || !active || slot.employeeIds.length >= assignment.minimumStaff;
        return <button key={toDateKey(date)} disabled={!canEdit(assignment)} className={`assignment-cell ${!active ? "inactive-cell" : ""} ${active && assignment.minimumStaff > 0 ? (coverageOk ? "coverage-ok" : "coverage-missing") : ""} ${!canEdit(assignment) ? "readonly-cell" : ""}`} onClick={() => onEdit(assignment.id, toDateKey(date))}>
          {slot.isException && <span className="exception-dot">•</span>}
          {!active ? <span className="na">s.o.</span> : people.length ? people.map((person) => <span className="person-pill" key={person.id}>{person.displayName}{conflicts.some((c) => c.id === person.id) && <small className="conflict-text">⚠ {t(language, "conflict")}</small>}</span>) : slot.note ? <span className="person-pill note-pill">{slot.note}</span> : <span className="empty-slot">{canEdit(assignment) ? t(language, "addAssignment") : "—"}</span>}
          {active && assignment.minimumStaff > 0 && <small className={coverageOk ? "ok-text" : "warn-text"}>{coverageOk ? `✓ ${t(language, "covered")}` : `! ${t(language, "minimum")} ${assignment.minimumStaff}`}</small>}
        </button>;
      })}
    </div>)}
    <div className="legend-bar"><span><b>•</b> {t(language, "exception")}</span><span>✓ {t(language, "covered").toLowerCase()}</span><span>! {t(language, "missingCoverage")}</span><span>{t(language, "clickEdit")}</span></div>
  </main>;
}

function EmployeeView({ assignments, weekdays, employees, language, effectiveSlot, availabilityFor }: {
  assignments: AssignmentDefinition[]; weekdays: Date[]; employees: Employee[]; language: Language;
  effectiveSlot: (assignmentId: string, date: Date) => { employeeIds: string[]; note?: string; isException: boolean };
  availabilityFor: (employeeId: string, date: Date) => ScheduleRequest[];
}) {
  return <main className="schedule-card">
    <div className="employee-grid header-row"><div className="assignment-header">{t(language, "employee")}</div>{weekdays.map((date) => <div className={`day-header ${isToday(date) ? "today" : ""}`} key={toDateKey(date)}>{formatDayHeader(date, language)}</div>)}</div>
    {employees.map((employee) => <div className="employee-grid employee-row" key={employee.id}>
      <div className="employee-info"><span className="avatar">{employee.initials}</span><div><strong>{employee.displayName}</strong><span>{employee.jobTitle}</span></div></div>
      {weekdays.map((date) => {
        const availability = availabilityFor(employee.id, date);
        const items = assignments.filter((a) => effectiveSlot(a.id, date).employeeIds.includes(employee.id));
        return <div className="employee-day" key={toDateKey(date)}>
          {availability.map((r) => <span key={r.id} className={`availability-pill req-${r.type}`}>{requestIcon[r.type]} {requestTypeLabel(language, r.type)}</span>)}
          {items.length ? items.map((a) => <span className={`mini-assignment cat-${a.category}`} key={a.id}>{categoryIcon[a.category]} {assignmentLabel(a, language, true)}{a.timeLabel ? <small>{a.timeLabel}</small> : null}</span>) : !availability.length ? <span className="empty-slot">—</span> : null}
        </div>;
      })}
    </div>)}
  </main>;
}

function RequestView({ state, language, actingUser, approvals, canReview, onNew, onStatus }: {
  state: AppState; language: Language; actingUser?: Employee; approvals: boolean; canReview: (employeeId: string) => boolean;
  onNew: () => void; onStatus: (id: string, status: RequestStatus) => void;
}) {
  const byId = Object.fromEntries(state.employees.map((e) => [e.id, e]));
  const visible = state.requests.filter((r) => {
    if (!actingUser) return false;
    if (roleRank[actingUser.role] >= roleRank.manager) return actingUser.role === "manager" ? byId[r.employeeId]?.teamId === actingUser.teamId : true;
    return r.employeeId === actingUser.id;
  }).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  return <main className="content-card">
    <div className="section-heading"><div><h2>{t(language, "requestTitle")}</h2><p>{t(language, "requestSubtitle")}</p></div><button className="primary-button" onClick={onNew}>{t(language, "newRequest")}</button></div>
    {!approvals && <div className="plan-info-banner">🔒 {t(language, "approvalsLocked")}</div>}
    <div className="request-list">{visible.length ? visible.map((r) => {
      const person = byId[r.employeeId];
      return <article className="request-card" key={r.id}>
        <div className={`request-icon req-${r.type}`}>{requestIcon[r.type]}</div>
        <div className="request-main"><div className="request-title-line"><strong>{person?.displayName ?? r.employeeId}</strong><span className={`status-badge status-${r.status}`}>{statusLabel(language, r.status)}</span></div><span className="request-type">{requestTypeLabel(language, r.type)} · {r.startDate}{r.endDate !== r.startDate ? ` → ${r.endDate}` : ""}</span>{r.note && <p>{r.note}</p>}</div>
        {r.status === "pending" && canReview(r.employeeId) && <div className="request-actions"><button className="secondary-button" onClick={() => onStatus(r.id, "rejected")}>{t(language, "reject")}</button><button className="primary-button" onClick={() => onStatus(r.id, "approved")}>{t(language, "approve")}</button></div>}
      </article>;
    }) : <EmptyState icon="📭" title={t(language, "noRequests")} />}</div>
  </main>;
}

function NotificationsView({ state, language, enabledByPlan, canManageTeam, onState, teamsContext }: {
  state: AppState; language: Language; enabledByPlan: boolean; canManageTeam: (teamId: string) => boolean; onState: (state: AppState) => void; teamsContext?: TeamsContextInfo;
}) {
  const [teamId, setTeamId] = useState(state.teams[0]?.id ?? "");
  const [previewDate, setPreviewDate] = useState(toDateKey(new Date()));
  const [sendStatus, setSendStatus] = useState<"idle"|"sending"|"sent"|"error">("idle");
  const [sendMessage, setSendMessage] = useState("");
  const team = state.teams.find((item) => item.id === teamId) ?? state.teams[0];
  if (!team) return <EmptyState icon="🔔" title={t(language, "notifications")} />;
  const setting = state.notifications.find((item) => item.teamId === team.id) ?? makeDefaultNotification(team.id);
  const editable = enabledByPlan && canManageTeam(team.id);
  const linked = !!team.microsoftTeamId;
  const updateSetting = (patch: Partial<DailyBriefSetting>) => {
    if (!editable) return;
    const next = { ...setting, ...patch };
    onState({ ...state, notifications: [...state.notifications.filter((item) => item.teamId !== team.id), next] });
    setSendStatus("idle");
  };
  const dayLabels: { day: number; key: "mondayShort"|"tuesdayShort"|"wednesdayShort"|"thursdayShort"|"fridayShort"|"saturdayShort"|"sundayShort" }[] = [
    { day: 1, key: "mondayShort" }, { day: 2, key: "tuesdayShort" }, { day: 3, key: "wednesdayShort" }, { day: 4, key: "thursdayShort" },
    { day: 5, key: "fridayShort" }, { day: 6, key: "saturdayShort" }, { day: 0, key: "sundayShort" }
  ];
  const toggleDay = (day: number) => updateSetting({ weekdays: setting.weekdays.includes(day) ? setting.weekdays.filter((d) => d !== day) : [...setting.weekdays, day] });
  const messageLanguage: Language = setting.language === "organization" ? language : setting.language;
  const preview = buildDailyBrief(state, team.id, previewDate, messageLanguage);

  const linkCurrentChannel = async () => {
    if (!teamsContext?.teamId) return;
    setSendStatus("sending");
    try {
      await bindTeam(team.id, teamsContext.teamId, teamsContext.channelId, teamsContext.channelName);
      const nextTeam = { ...team, microsoftTeamId: teamsContext.teamId, microsoftChannelId: teamsContext.channelId, microsoftChannelName: teamsContext.channelName };
      onState({ ...state, teams: state.teams.map((item) => item.id === team.id ? nextTeam : item), notifications: state.notifications.map((item) => item.teamId === team.id ? { ...item, channelName: teamsContext.channelName || item.channelName } : item) });
      setSendStatus("idle");
    } catch (error) {
      setSendStatus("error"); setSendMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const sendNow = async () => {
    setSendStatus("sending"); setSendMessage("");
    try {
      await sendBriefNow(team.id, previewDate);
      setSendStatus("sent");
    } catch (error) {
      setSendStatus("error"); setSendMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return <main className="content-card notification-layout">
    <section className="notification-settings">
      <div className="section-heading"><div><h2>🔔 {t(language, "dailyBriefTitle")}</h2><p>{t(language, "dailyBriefSubtitle")}</p></div><span className={`connection-badge ${linked ? "connected-connection" : "pending-connection"}`}>{linked ? (language === "fr" ? "Canal lié" : "Channel linked") : t(language, "botNotConnected")}</span></div>
      {!enabledByPlan && <div className="plan-info-banner">🔒 {t(language, "integrationLocked")}</div>}
      <label className="field-label">{t(language, "notificationTeam")}<select value={team.id} onChange={(e) => { setTeamId(e.target.value); setSendStatus("idle"); }}>{state.teams.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="toggle-row"><input type="checkbox" disabled={!editable} checked={setting.enabled} onChange={(e) => updateSetting({ enabled: e.target.checked })} /><span><strong>{t(language, "notificationEnabled")}</strong><small>{t(language, "exactTimeHelp")}</small></span></label>
      <div className="notification-grid">
        <label className="field-label">{t(language, "notificationTime")}<input type="time" step="300" disabled={!editable} value={setting.time} onChange={(e) => updateSetting({ time: e.target.value })} /></label>
        <label className="field-label">{t(language, "notificationTimezone")}<select disabled={!editable} value={setting.timezone} onChange={(e) => updateSetting({ timezone: e.target.value })}><option value="America/Toronto">America/Toronto</option><option value="America/New_York">America/New_York</option><option value="America/Chicago">America/Chicago</option><option value="America/Denver">America/Denver</option><option value="America/Vancouver">America/Vancouver</option><option value="UTC">UTC</option></select></label>
        <label className="field-label full-span">{t(language, "notificationChannel")}<input disabled={!editable} value={setting.channelName} onChange={(e) => updateSetting({ channelName: e.target.value })} placeholder={language === "fr" ? "Ex. Général" : "E.g. General"} /></label>
      </div>
      <div className="field-label"><span>{t(language, "notificationDays")}</span><div className="weekday-toggle">{dayLabels.map(({ day, key }) => <button type="button" disabled={!editable} key={day} className={setting.weekdays.includes(day) ? "selected" : ""} onClick={() => toggleDay(day)}>{t(language, key)}</button>)}</div></div>
      <div className="field-label"><span>{t(language, "notificationContent")}</span><div className="check-list"><label><input type="checkbox" disabled={!editable} checked={setting.includeAssignments} onChange={(e) => updateSetting({ includeAssignments: e.target.checked })} />{t(language, "includeAssignments")}</label><label><input type="checkbox" disabled={!editable} checked={setting.includeAvailability} onChange={(e) => updateSetting({ includeAvailability: e.target.checked })} />{t(language, "includeAvailability")}</label><label><input type="checkbox" disabled={!editable} checked={setting.includeCoverageWarnings} onChange={(e) => updateSetting({ includeCoverageWarnings: e.target.checked })} />{t(language, "includeCoverageWarnings")}</label></div></div>
      <label className="field-label">{t(language, "notificationLanguage")}<select disabled={!editable} value={setting.language} onChange={(e) => updateSetting({ language: e.target.value as NotificationLanguage })}><option value="organization">{t(language, "useOrganizationLanguage")}</option><option value="fr">Français</option><option value="en">English</option></select></label>
      <div className="integration-note"><strong>{language === "fr" ? "Connexion Teams" : "Teams connection"}</strong><span>{linked ? `${team.microsoftChannelName || setting.channelName} · ${team.microsoftTeamId}` : (language === "fr" ? "Installe l’app dans l’équipe Teams, puis lie le canal courant." : "Install the app in the Teams team, then link the current channel.")}</span></div>
      {teamsContext?.inTeams && teamsContext.teamId && <button className="secondary-button full-button" disabled={!editable || sendStatus === "sending"} onClick={linkCurrentChannel}>{language === "fr" ? "Lier le canal Teams courant" : "Link current Teams channel"}</button>}
    </section>
    <section className="notification-preview-panel">
      <div className="preview-toolbar"><div><p className="eyebrow">{t(language, "preview")}</p><strong>{team.name} · #{setting.channelName || "—"} · {setting.time}</strong></div><label>{t(language, "previewDate")}<input type="date" value={previewDate} onChange={(e) => { setPreviewDate(e.target.value); setSendStatus("idle"); }} /></label></div>
      <DailyBriefPreview preview={preview} language={messageLanguage} setting={setting} />
      <button className="primary-button full-button" disabled={!enabledByPlan || !setting.enabled || !linked || sendStatus === "sending"} onClick={sendNow}>{sendStatus === "sending" ? (language === "fr" ? "Envoi..." : "Sending...") : (language === "fr" ? "Envoyer maintenant dans Teams" : "Send now to Teams")}</button>
      {sendStatus === "sent" && <div className="info-banner">✓ {language === "fr" ? "Message envoyé dans Teams." : "Message sent to Teams."}</div>}
      {sendStatus === "error" && <div className="warning-banner">⚠ {sendMessage}</div>}
    </section>
  </main>;
}

type DailyBriefPreviewData = {
  dateLabel: string; cycle: CycleType; assignments: { icon: string; label: string; time?: string; people: string[]; note?: string }[];
  availability: { icon: string; person: string; type: string }[]; coverageWarnings: string[];
};

function buildDailyBrief(state: AppState, teamId: string, dateKey: string, language: Language): DailyBriefPreviewData {
  const date = new Date(`${dateKey}T12:00:00`);
  const cycle: CycleType = state.organization.planId === "free" ? "A" : cycleForWeek(startOfWeek(date));
  const employeeById = Object.fromEntries(state.employees.map((employee) => [employee.id, employee]));
  const teamEmployees = new Set(state.employees.filter((employee) => employee.teamId === teamId).map((employee) => employee.id));
  const teamAssignments = state.assignments.filter((assignment) => assignment.teamId === teamId && (!assignment.activeWeekdays || assignment.activeWeekdays.includes(date.getDay())));
  const items = teamAssignments.map((assignment) => {
    const ex = state.exceptions.find((item) => item.assignmentId === assignment.id && item.date === dateKey);
    const base = state.cycleSlots.find((item) => item.cycle === cycle && item.assignmentId === assignment.id && item.weekday === date.getDay());
    const ids = ex?.employeeIds ?? base?.employeeIds ?? [];
    return { assignment, ids, note: ex?.note ?? base?.note };
  });
  const assignments = items.filter(({ ids, note }) => ids.length > 0 || !!note).map(({ assignment, ids, note }) => ({
    icon: categoryIcon[assignment.category], label: assignmentLabel(assignment, language, true), time: assignment.timeLabel,
    people: ids.map((id) => employeeById[id]?.displayName ?? id), note
  }));
  const availability = state.requests.filter((request) => request.status === "approved" && teamEmployees.has(request.employeeId) && dateInRange(date, request.startDate, request.endDate)).map((request) => ({
    icon: requestIcon[request.type], person: employeeById[request.employeeId]?.displayName ?? request.employeeId, type: requestTypeLabel(language, request.type)
  }));
  const coverageWarnings = items.filter(({ assignment, ids }) => assignment.minimumStaff > 0 && ids.length < assignment.minimumStaff).map(({ assignment, ids }) => `${assignmentLabel(assignment, language, true)}: ${ids.length}/${assignment.minimumStaff}`);
  return { dateLabel: formatLongDate(date, language), cycle, assignments, availability, coverageWarnings };
}

function DailyBriefPreview({ preview, language, setting }: { preview: DailyBriefPreviewData; language: Language; setting: DailyBriefSetting }) {
  return <div className="teams-message-preview"><div className="teams-message-header"><span className="bot-avatar">HT</span><div><strong>Horaire Teams</strong><small>{language === "fr" ? "Application" : "App"}</small></div></div><div className="teams-message-body"><h3>📅 {t(language, "dailyPlan")} — {preview.dateLabel}</h3><p className="cycle-line">{language === "fr" ? "Semaine" : "Week"} {preview.cycle}</p>
    {setting.includeAssignments && <section><strong>🗓️ {t(language, "assignments")}</strong>{preview.assignments.length ? preview.assignments.map((item, index) => <div className="brief-line" key={`${item.label}-${index}`}><span>{item.icon}</span><div><b>{item.label}</b>{item.time && <small>{item.time}</small>}<span>{item.people.length ? item.people.join(", ") : item.note || "—"}{item.note && item.people.length ? ` · ${item.note}` : ""}</span></div></div>) : <p className="muted-line">{t(language, "noTeamAssignments")}</p>}</section>}
    {setting.includeAvailability && preview.availability.length > 0 && <section><strong>🌴 {t(language, "availabilitySection")}</strong>{preview.availability.map((item, index) => <div className="availability-line" key={`${item.person}-${index}`}>{item.icon} <b>{item.person}</b> — {item.type}</div>)}</section>}
    {setting.includeCoverageWarnings && <section><strong>🛡️ {t(language, "coverageSection")}</strong>{preview.coverageWarnings.length ? preview.coverageWarnings.map((warning) => <div className="coverage-warning" key={warning}>⚠ {warning}</div>) : <div className="coverage-ok-message">✓ {t(language, "allCovered")}</div>}</section>}
  </div></div>;
}

function TeamView({ state, language, plan, actingUser, canManageTeam, onAddEmployee, onState }: {
  state: AppState; language: Language; plan: PlanId; actingUser?: Employee; canManageTeam: (teamId: string) => boolean; onAddEmployee: () => void; onState: (state: AppState) => void;
}) {
  const config = PLAN_CONFIG[plan];
  const activeCount = state.employees.filter((e) => e.active).length;
  const canAdd = roleRank[actingUser?.role ?? "viewer"] >= roleRank.admin && activeCount < config.maxEmployees;
  const updateEmployee = (id: string, patch: Partial<Employee>) => onState({ ...state, employees: state.employees.map((e) => e.id === id ? { ...e, ...patch } : e) });
  return <main className="content-card">
    <div className="section-heading"><div><h2>{t(language, "managerSection")}</h2><p>{t(language, "managerSubtitle")}</p></div><div className="section-actions"><span className="count-badge">{activeCount} {t(language, "active")}{Number.isFinite(config.maxEmployees) ? ` / ${config.maxEmployees}` : ""}</span><button className="primary-button" disabled={!canAdd} onClick={onAddEmployee}>{t(language, "addEmployee")}</button></div></div>
    {!config.managers && <div className="plan-info-banner">🔒 {t(language, "permissionsLocked")}</div>}
    {!canAdd && activeCount >= config.maxEmployees && <div className="warning-banner">{t(language, "employeeLimit")}</div>}
    <div className="team-groups">{state.teams.map((team) => <section className="team-section" key={team.id}><h3>{team.name}</h3><div className="team-list">{state.employees.filter((e) => e.teamId === team.id).map((e) => <div className={`team-member ${!e.active ? "disabled" : ""}`} key={e.id}><span className="avatar">{e.initials}</span><div className="grow"><strong>{e.displayName}</strong><span>{e.jobTitle}</span></div><select disabled={!canManageTeam(team.id) || (!config.managers && e.role === "employee")} value={e.role} onChange={(ev) => updateEmployee(e.id, { role: ev.target.value as UserRole })}>{roleOptions(language, config.managers)}</select><button className="secondary-button" disabled={!canManageTeam(team.id)} onClick={() => updateEmployee(e.id, { active: !e.active })}>{e.active ? t(language, "deactivate") : t(language, "activate")}</button></div>)}</div></section>)}</div>
  </main>;
}

function OrganizationView({ state, language, onState, onPlan, onBlank, onDemo }: { state: AppState; language: Language; onState: (state: AppState) => void; onPlan: (plan: PlanId) => void; onBlank: () => void; onDemo: () => void; }) {
  const config = PLAN_CONFIG[state.organization.planId];
  const [newTeam, setNewTeam] = useState("");
  const canAddTeam = state.teams.length < config.maxTeams;
  return <main className="content-card two-column">
    <section><h2>{t(language, "organizationSettings")}</h2><label className="field-label">{t(language, "organizationName")}<input value={state.organization.name} onChange={(e) => onState({ ...state, organization: { ...state.organization, name: e.target.value } })} /></label><label className="field-label">{t(language, "language")}<select value={language} onChange={(e) => onState({ ...state, organization: { ...state.organization, language: e.target.value as Language } })}><option value="fr">{t(language, "languageFr")}</option><option value="en">{t(language, "languageEn")}</option></select></label><label className="field-label">{t(language, "plan")}<select value={state.organization.planId} onChange={(e) => onPlan(e.target.value as PlanId)}><option value="free">{t(language, "free")}</option><option value="team">{t(language, "teamPlan")} ({t(language, "paid")})</option><option value="business">{t(language, "business")} ({t(language, "paid")})</option></select></label><div className="plan-info-banner">ℹ️ {t(language, "prototypePlanNote")}</div>
      <h3>{t(language, "teamLabel")}</h3><div className="inline-form"><input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder={t(language, "teamName")} /><button className="secondary-button" disabled={!canAddTeam || !newTeam.trim()} onClick={() => { const id = `team-${Date.now()}`; onState({ ...state, teams: [...state.teams, { id, name: newTeam.trim(), active: true }] }); setNewTeam(""); }}>{t(language, "addTeam")}</button></div>{!canAddTeam && <small className="limit-text">{t(language, "teamLimit")}</small>}
    </section>
    <section className="template-panel"><h2>{t(language, "templates")}</h2><p>{t(language, "blankCompanyHelp")}</p><button className="template-button" onClick={onDemo}><span>🏥</span><div><strong>{t(language, "technocentreDemo")}</strong><small>Demo data · A/B schedule · teams</small></div></button><button className="template-button" onClick={onBlank}><span>🏢</span><div><strong>{t(language, "blankCompany")}</strong><small>Empty tenant / modèle vierge</small></div></button><div className="warning-banner">⚠ {t(language, "resetDataWarning")}</div></section>
  </main>;
}

function PlansView({ language, current, onPlan }: { language: Language; current: PlanId; onPlan: (plan: PlanId) => void }) {
  const plans: PlanId[] = ["free", "team", "business"];
  const rows: { key: keyof typeof PLAN_CONFIG.free | "basic" | "timeOff"; label: string }[] = [
    { key: "maxEmployees", label: t(language, "maxEmployees") }, { key: "maxTeams", label: t(language, "maxTeams") }, { key: "basic", label: t(language, "basicSchedule") }, { key: "timeOff", label: t(language, "timeOff") }, { key: "approvals", label: t(language, "approvalWorkflow") }, { key: "managers", label: t(language, "managers") }, { key: "cycleAB", label: t(language, "cycleAB") }, { key: "advancedPermissions", label: t(language, "advancedPermissions") }, { key: "integrations", label: t(language, "integrations") }, { key: "dailyBrief", label: t(language, "dailyTeamsBrief") }
  ];
  const renderValue = (planId: PlanId, key: typeof rows[number]["key"]) => {
    if (key === "basic" || key === "timeOff") return `✓ ${t(language, "included")}`;
    const value = PLAN_CONFIG[planId][key];
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : t(language, "unlimited");
    return value ? `✓ ${t(language, "included")}` : `— ${t(language, "notIncluded")}`;
  };
  return <main className="content-card"><div className="section-heading"><div><h2>{t(language, "plansTitle")}</h2><p>{t(language, "plansSubtitle")}</p></div></div><div className="plan-cards">{plans.map((p) => <article className={`plan-card ${current === p ? "current" : ""}`} key={p}><span className={`plan-badge plan-${p}`}>{planLabel(language, p)}</span><h3>{planLabel(language, p)}</h3><p>{p === "free" ? (language === "fr" ? "Pour essayer et les très petites équipes." : "For trials and very small teams.") : p === "team" ? (language === "fr" ? "Pour les équipes qui gèrent demandes et approbations." : "For teams managing requests and approvals.") : (language === "fr" ? "Pour les organisations multiéquipes et déploiements avancés." : "For multi-team organizations and advanced deployments.")}</p><button className={current === p ? "secondary-button" : "primary-button"} onClick={() => onPlan(p)}>{current === p ? t(language, "currentPlan") : (language === "fr" ? "Tester ce forfait" : "Test this plan")}</button></article>)}</div><div className="feature-table"><div className="feature-row feature-head"><strong>{language === "fr" ? "Fonction" : "Feature"}</strong>{plans.map((p) => <strong key={p}>{planLabel(language, p)}</strong>)}</div>{rows.map((row) => <div className="feature-row" key={String(row.key)}><span>{row.label}</span>{plans.map((p) => <span key={p}>{renderValue(p, row.key)}</span>)}</div>)}</div></main>;
}

function AssignmentEditor({ assignment, date, language, employees, selected, note, isException, editable, onClose, onSave, onRevert }: { assignment: AssignmentDefinition; date: string; language: Language; employees: Employee[]; selected: string[]; note: string; isException: boolean; editable: boolean; onClose: () => void; onSave: (employeeIds: string[], note: string) => void; onRevert: () => void; }) {
  const [ids, setIds] = useState(selected); const [localNote, setLocalNote] = useState(note);
  const toggle = (id: string) => editable && setIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{t(language, "editAssignment")}</p><h2>{assignmentLabel(assignment, language, true)}</h2><span>{formatLongDate(new Date(`${date}T12:00:00`), language)} · {assignment.timeLabel || assignment.location || "—"}</span></div><button className="close-button" onClick={onClose}>×</button></div>{isException && <div className="info-banner">{t(language, "exceptionInfo")}</div>}{!editable && <div className="warning-banner modal-warning">🔒 {t(language, "readOnly")}</div>}<div className="modal-content"><label className="field-label">{t(language, "assignedPeople")}</label><div className="employee-picker">{employees.map((e) => <label className={ids.includes(e.id) ? "picked" : ""} key={e.id}><input disabled={!editable} type="checkbox" checked={ids.includes(e.id)} onChange={() => toggle(e.id)} /><span className="avatar small">{e.initials}</span><span><strong>{e.displayName}</strong><small>{e.jobTitle}</small></span></label>)}</div><label className="field-label">{t(language, "specialNote")}<input disabled={!editable} value={localNote} onChange={(e) => setLocalNote(e.target.value)} placeholder={t(language, "specialPlaceholder")} /></label></div><div className="modal-footer split"><div>{editable && isException && <button className="ghost-button" onClick={onRevert}>{t(language, "revert")}</button>}</div><div className="footer-actions"><button className="secondary-button" onClick={onClose}>{editable ? t(language, "cancel") : t(language, "close")}</button>{editable && <button className="primary-button" onClick={() => onSave(ids, localNote.trim())}>{t(language, "saveException")}</button>}</div></div></div></div>;
}

function RequestEditor({ state, language, actingUser, approvals, canManageTeam, onClose, onSave }: { state: AppState; language: Language; actingUser?: Employee; approvals: boolean; canManageTeam: (teamId: string) => boolean; onClose: () => void; onSave: (request: ScheduleRequest) => void; }) {
  const manageable = state.employees.filter((e) => e.active && (e.id === actingUser?.id || canManageTeam(e.teamId)));
  const [employeeId, setEmployeeId] = useState(actingUser?.id ?? manageable[0]?.id ?? ""); const [type, setType] = useState<RequestType>("vacation"); const [startDate, setStartDate] = useState(toDateKey(new Date())); const [endDate, setEndDate] = useState(toDateKey(new Date())); const [note, setNote] = useState("");
  const valid = !!employeeId && !!startDate && !!endDate && endDate >= startDate;
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{t(language, "requests")}</p><h2>{t(language, "newRequest")}</h2></div><button className="close-button" onClick={onClose}>×</button></div><div className="modal-content form-grid"><label className="field-label">{t(language, "employee")}<select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>{manageable.map((e) => <option key={e.id} value={e.id}>{e.displayName}</option>)}</select></label><label className="field-label">{t(language, "requestType")}<select value={type} onChange={(e) => setType(e.target.value as RequestType)}><option value="vacation">{t(language, "vacation")}</option><option value="absence">{t(language, "absence")}</option><option value="remote">{t(language, "remote")}</option></select></label><label className="field-label">{t(language, "startDate")}<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label className="field-label">{t(language, "endDate")}<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label><label className="field-label full-span">{t(language, "note")}<input value={note} onChange={(e) => setNote(e.target.value)} /></label>{!approvals && <div className="plan-info-banner full-span">{t(language, "approvalsLocked")}</div>}</div><div className="modal-footer"><div className="footer-actions"><button className="secondary-button" onClick={onClose}>{t(language, "cancel")}</button><button disabled={!valid} className="primary-button" onClick={() => onSave({ id: `req-${Date.now()}`, employeeId, type, startDate, endDate, note: note.trim() || undefined, status: approvals ? "pending" : "approved", createdAt: new Date().toISOString(), reviewedBy: approvals ? undefined : actingUser?.id })}>{t(language, "save")}</button></div></div></div></div>;
}

function EmployeeEditor({ state, language, plan, onClose, onSave }: { state: AppState; language: Language; plan: PlanId; onClose: () => void; onSave: (employee: Employee) => void; }) {
  const config = PLAN_CONFIG[plan]; const [name, setName] = useState(""); const [jobTitle, setJobTitle] = useState(""); const [teamId, setTeamId] = useState(state.teams[0]?.id ?? ""); const [role, setRole] = useState<UserRole>("employee"); const [microsoftUserId, setMicrosoftUserId] = useState("");
  const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map((p) => p[0]?.toUpperCase()).join("") || "??";
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{t(language, "team")}</p><h2>{t(language, "addEmployee")}</h2></div><button className="close-button" onClick={onClose}>×</button></div><div className="modal-content form-grid"><label className="field-label full-span">{t(language, "name")}<input value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field-label">{t(language, "jobTitle")}<input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></label><label className="field-label">{t(language, "teamLabel")}<select value={teamId} onChange={(e) => setTeamId(e.target.value)}>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="field-label">{t(language, "role")}<select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>{roleOptions(language, config.managers)}</select></label><label className="field-label full-span">Microsoft Entra Object ID<input value={microsoftUserId} onChange={(e) => setMicrosoftUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" /></label></div><div className="modal-footer"><div className="footer-actions"><button className="secondary-button" onClick={onClose}>{t(language, "cancel")}</button><button disabled={!name.trim() || !teamId} className="primary-button" onClick={() => onSave({ id: `emp-${Date.now()}`, displayName: name.trim(), initials, jobTitle: jobTitle.trim(), teamId, role, active: true, microsoftUserId: microsoftUserId.trim() || undefined })}>{t(language, "save")}</button></div></div></div></div>;
}

function BlankCompanyEditor({ language, onClose, onCreate }: { language: Language; onClose: () => void; onCreate: (name: string, plan: PlanId, language: Language) => void; }) {
  const [name, setName] = useState(language === "fr" ? "Compagnie X" : "Company X"); const [plan, setPlan] = useState<PlanId>("free"); const [lang, setLang] = useState<Language>(language);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">SaaS tenant</p><h2>{t(language, "blankCompany")}</h2></div><button className="close-button" onClick={onClose}>×</button></div><div className="modal-content"><label className="field-label">{t(language, "companyName")}<input value={name} onChange={(e) => setName(e.target.value)} /></label><label className="field-label">{t(language, "plan")}<select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)}><option value="free">{t(language, "free")}</option><option value="team">{t(language, "teamPlan")}</option><option value="business">{t(language, "business")}</option></select></label><label className="field-label">{t(language, "language")}<select value={lang} onChange={(e) => setLang(e.target.value as Language)}><option value="fr">Français</option><option value="en">English</option></select></label></div><div className="modal-footer"><div className="footer-actions"><button className="secondary-button" onClick={onClose}>{t(language, "cancel")}</button><button disabled={!name.trim()} className="primary-button" onClick={() => onCreate(name.trim(), plan, lang)}>{t(language, "create")}</button></div></div></div></div>;
}

function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3>{description && <p>{description}</p>}</div>; }
function requestTypeLabel(language: Language, type: RequestType) { return t(language, type); }
function statusLabel(language: Language, status: RequestStatus) { return t(language, status); }
function planLabel(language: Language, plan: PlanId) { return plan === "free" ? t(language, "free") : plan === "team" ? t(language, "teamPlan") : t(language, "business"); }
function roleLabel(language: Language, role: UserRole) { const map: Record<UserRole, "owner"|"admin"|"manager"|"employeeRole"|"viewer"> = { owner: "owner", admin: "admin", manager: "manager", employee: "employeeRole", viewer: "viewer" }; return t(language, map[role]); }
function roleOptions(language: Language, managersEnabled: boolean) { const roles: UserRole[] = managersEnabled ? ["owner","admin","manager","employee","viewer"] : ["owner","admin","employee","viewer"]; return roles.map((r) => <option key={r} value={r}>{roleLabel(language, r)}</option>); }
