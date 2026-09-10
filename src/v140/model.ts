import { dateInRange, startOfWeek, toDateKey } from "../dateUtils";
import { createBlankCompanyState } from "../sampleData";
import type { AppState, AssignmentDefinition, CycleType, Employee, Language, PlanId, ScheduleRequest, UserRole } from "../types";

export type AccessLevel = "admin" | "employee";
export type PresenceCategory = "onsite" | "remote";
export type PresenceStatus = "onsite" | "remote" | "leave";
export type RotationWeek = 1 | 2;
export type OperationalEvent = { id: string; title: string; date: string; startTime?: string; endTime?: string };
export type CalendarConfig = {
  outlookCalendarUrl: string;
  defaultMinimumOnSite: number;
  staffPerExtraConcurrentEvent: number;
  rotationEnabled: boolean;
  rotationAnchorDate: string;
  events: OperationalEvent[];
};
export type AssignmentDraft = {
  id?: string;
  labelFr: string;
  labelEn: string;
  shortLabelFr: string;
  shortLabelEn: string;
  timeLabel: string;
  location: string;
  color: string;
  presenceCategory: PresenceCategory;
  minimumStaff: number;
  teamId: string;
  activeWeekdays: number[];
};

export const STORAGE_KEY = "horaireTeams.v1";
export const CONFIG_KEY = "pilotecalendar.v1.4.config";
export const DEFAULT_ASSIGNMENT_COLOR = "#5B5FC7";
export const DEFAULT_REMOTE_COLOR = "#4F80C8";
export const WEEKDAYS = [
  { value: 1, fr: "Lun", en: "Mon" },
  { value: 2, fr: "Mar", en: "Tue" },
  { value: 3, fr: "Mer", en: "Wed" },
  { value: 4, fr: "Jeu", en: "Thu" },
  { value: 5, fr: "Ven", en: "Fri" },
];

export const PLAN_INFO: Record<PlanId, { fr: string; en: string; employees: string; teams: string; featuresFr: string[]; featuresEn: string[] }> = {
  free: {
    fr: "Gratuit", en: "Free", employees: "5", teams: "1",
    featuresFr: ["Horaire hebdomadaire", "Ma semaine", "Vue d’équipe", "Demandes simples"],
    featuresEn: ["Weekly schedule", "My week", "Team overview", "Basic requests"],
  },
  team: {
    fr: "Équipe", en: "Team", employees: "30", teams: "5",
    featuresFr: ["Tout le forfait Gratuit", "Approbation des demandes", "Horaire rotatif sur 2 semaines", "Calendrier central", "Minimum présentiel dynamique", "Intégrations Microsoft 365"],
    featuresEn: ["Everything in Free", "Request approvals", "Two-week rotating schedule", "Central calendar", "Dynamic on-site minimum", "Microsoft 365 integrations"],
  },
  business: {
    fr: "Entreprise", en: "Business", employees: "Illimité", teams: "Illimité",
    featuresFr: ["Tout le forfait Équipe", "Employés et équipes illimités", "Administration avancée", "Permissions avancées", "Déploiement multiéquipes"],
    featuresEn: ["Everything in Team", "Unlimited employees and teams", "Advanced administration", "Advanced permissions", "Multi-team deployment"],
  },
};

export function defaultConfig(): CalendarConfig {
  return {
    outlookCalendarUrl: "https://outlook.office.com/calendar/view/week",
    defaultMinimumOnSite: 2,
    staffPerExtraConcurrentEvent: 1,
    rotationEnabled: false,
    rotationAnchorDate: toDateKey(startOfWeek(new Date())),
    events: [],
  };
}

export function normalizeColor(value?: string, fallback = DEFAULT_ASSIGNMENT_COLOR) {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value! : fallback;
}

export function normalizeAssignment(item: AssignmentDefinition): AssignmentDefinition {
  const text = [item.id, item.labelFr, item.labelEn, item.shortLabelFr, item.shortLabelEn, item.location].filter(Boolean).join(" ").toLowerCase();
  const remote = item.category === "remote" || text.includes("erg");
  return { ...item, category: remote ? "remote" : "other", color: normalizeColor(item.color, remote ? DEFAULT_REMOTE_COLOR : DEFAULT_ASSIGNMENT_COLOR) };
}

export function readState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (!parsed.organization?.isDemo) return { ...parsed, assignments: (parsed.assignments ?? []).map(normalizeAssignment) };
    }
  } catch { /* clean state below */ }
  return createBlankCompanyState("fr", "free", "Mon organisation");
}

export function normalizeConfig(value: any): CalendarConfig {
  const defaults = defaultConfig();
  const events: OperationalEvent[] = Array.isArray(value?.events)
    ? value.events.map((event: any) => ({
        id: String(event.id ?? `event-${Date.now()}-${Math.random()}`),
        title: String(event.title ?? "Événement"),
        date: String(event.date ?? toDateKey(new Date())),
        startTime: event.startTime ?? event.time ?? undefined,
        endTime: event.endTime ?? undefined,
      }))
    : [];
  return {
    outlookCalendarUrl: value?.outlookCalendarUrl || defaults.outlookCalendarUrl,
    defaultMinimumOnSite: Math.max(0, Number(value?.defaultMinimumOnSite ?? defaults.defaultMinimumOnSite)),
    staffPerExtraConcurrentEvent: Math.max(0, Number(value?.staffPerExtraConcurrentEvent ?? 1)),
    rotationEnabled: Boolean(value?.rotationEnabled ?? false),
    rotationAnchorDate: value?.rotationAnchorDate || defaults.rotationAnchorDate,
    events,
  };
}

export function readConfig(): CalendarConfig {
  const keys = [CONFIG_KEY, "pilotecalendar.v1.3.1.config", "pilotecalendar.v1.3.config", "pilotecalendar.v1.2.config", "pilotecalendar.v1.1.config"];
  try {
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeConfig(JSON.parse(raw));
    }
  } catch { /* defaults below */ }
  return defaultConfig();
}

export function isAdmin(employee?: Employee) { return employee?.role === "owner" || employee?.role === "admin"; }
export function accessLevel(role: UserRole): AccessLevel { return role === "owner" || role === "admin" ? "admin" : "employee"; }
export function assignmentLabel(item: AssignmentDefinition, language: Language, short = false) { return language === "fr" ? (short ? item.shortLabelFr || item.labelFr : item.labelFr) : (short ? item.shortLabelEn || item.labelEn : item.labelEn); }
export function assignmentIsRemote(item: AssignmentDefinition) { return item.category === "remote"; }
export function assignmentCategoryLabel(item: AssignmentDefinition, language: Language) { return assignmentIsRemote(item) ? (language === "fr" ? "À distance" : "Remote") : (language === "fr" ? "Présentiel" : "On-site"); }
export function assignmentIcon(item: AssignmentDefinition) { return assignmentIsRemote(item) ? "🏠" : "🏢"; }
export function assignmentColor(item: AssignmentDefinition) { return normalizeColor(item.color, assignmentIsRemote(item) ? DEFAULT_REMOTE_COLOR : DEFAULT_ASSIGNMENT_COLOR); }
export function requestLabel(request: ScheduleRequest, language: Language) { return language === "fr" ? (request.type === "remote" ? "Télétravail" : request.type === "vacation" ? "Congé" : "Autre") : (request.type === "remote" ? "Remote work" : request.type === "vacation" ? "Leave" : "Other"); }

export function rotationWeekForDate(config: CalendarConfig, date: Date): RotationWeek {
  if (!config.rotationEnabled) return 1;
  const anchor = startOfWeek(new Date(`${config.rotationAnchorDate}T12:00:00`));
  const current = startOfWeek(date);
  const weeks = Math.floor((Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()) - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / (7 * 86400000));
  return ((weeks % 2) + 2) % 2 === 0 ? 1 : 2;
}
export function cycleForRotationWeek(week: RotationWeek): CycleType { return week === 1 ? "A" : "B"; }
export function rotationLabel(config: CalendarConfig, date: Date, language: Language) { return config.rotationEnabled ? (language === "fr" ? `Rotation · Semaine ${rotationWeekForDate(config, date)}` : `Rotation · Week ${rotationWeekForDate(config, date)}`) : (language === "fr" ? "Horaire hebdomadaire" : "Weekly schedule"); }

export function weeklySlot(state: AppState, assignmentId: string, weekday: number, cycle: CycleType) {
  return state.cycleSlots.find((slot) => slot.assignmentId === assignmentId && slot.weekday === weekday && slot.cycle === cycle)
    ?? state.cycleSlots.find((slot) => slot.assignmentId === assignmentId && slot.weekday === weekday);
}

export function assignmentsForEmployee(state: AppState, config: CalendarConfig, employeeId: string, date: Date) {
  const dateKey = toDateKey(date);
  const cycle = cycleForRotationWeek(rotationWeekForDate(config, date));
  return state.assignments.filter((assignment) => {
    if (assignment.activeWeekdays?.length && !assignment.activeWeekdays.includes(date.getDay())) return false;
    const exception = state.exceptions.find((item) => item.assignmentId === assignment.id && item.date === dateKey);
    const employeeIds = exception?.employeeIds ?? weeklySlot(state, assignment.id, date.getDay(), cycle)?.employeeIds ?? [];
    return employeeIds.includes(employeeId);
  });
}

export function approvedRequests(state: AppState, employeeId: string, date: Date) {
  return state.requests.filter((request) => request.employeeId === employeeId && request.status === "approved" && dateInRange(date, request.startDate, request.endDate));
}

export function presenceStatus(state: AppState, config: CalendarConfig, employee: Employee, date: Date): PresenceStatus {
  const requests = approvedRequests(state, employee.id, date);
  if (requests.some((request) => request.type === "vacation" || request.type === "absence")) return "leave";
  if (requests.some((request) => request.type === "remote")) return "remote";
  if (assignmentsForEmployee(state, config, employee.id, date).some(assignmentIsRemote)) return "remote";
  return "onsite";
}
export function presenceText(status: PresenceStatus, language: Language) { return language === "fr" ? (status === "onsite" ? "Présentiel" : status === "remote" ? "À distance" : "Absent") : (status === "onsite" ? "On-site" : status === "remote" ? "Remote" : "Away"); }

function timeToMinutes(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
function eventInterval(event: OperationalEvent) {
  const start = timeToMinutes(event.startTime) ?? 540;
  const parsedEnd = timeToMinutes(event.endTime);
  return { start, end: parsedEnd !== null && parsedEnd > start ? parsedEnd : start + 60 };
}
export function peakConcurrentEvents(events: OperationalEvent[]) {
  const points = events.flatMap((event) => { const { start, end } = eventInterval(event); return [{ minute: start, delta: 1 }, { minute: end, delta: -1 }]; }).sort((a, b) => a.minute - b.minute || a.delta - b.delta);
  let active = 0; let peak = 0;
  for (const point of points) { active += point.delta; peak = Math.max(peak, active); }
  return peak;
}
export function requiredOnSite(config: CalendarConfig, date: Date) {
  const events = config.events.filter((event) => event.date === toDateKey(date));
  const peak = peakConcurrentEvents(events);
  return { peak, required: config.defaultMinimumOnSite + Math.max(0, peak - 1) * config.staffPerExtraConcurrentEvent };
}

export function emptyAssignmentDraft(state: AppState): AssignmentDraft {
  return { labelFr: "", labelEn: "", shortLabelFr: "", shortLabelEn: "", timeLabel: "", location: "", color: DEFAULT_ASSIGNMENT_COLOR, presenceCategory: "onsite", minimumStaff: 0, teamId: state.teams.find((team) => team.active)?.id ?? state.teams[0]?.id ?? "main", activeWeekdays: [1, 2, 3, 4, 5] };
}
export function draftFromAssignment(item: AssignmentDefinition): AssignmentDraft {
  return { id: item.id, labelFr: item.labelFr, labelEn: item.labelEn, shortLabelFr: item.shortLabelFr, shortLabelEn: item.shortLabelEn, timeLabel: item.timeLabel ?? "", location: item.location ?? "", color: assignmentColor(item), presenceCategory: assignmentIsRemote(item) ? "remote" : "onsite", minimumStaff: item.minimumStaff, teamId: item.teamId, activeWeekdays: item.activeWeekdays?.length ? [...item.activeWeekdays] : [1, 2, 3, 4, 5] };
}
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"; }
