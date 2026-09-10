import type { AppState, AssignmentDefinition, AssignmentSlot, DailyBriefSetting, Employee, Organization, TeamDefinition } from "./types";

const organization: Organization = {
  id: "technocentre-demo",
  name: "Horaire Technocentre",
  language: "fr",
  planId: "business",
  isDemo: true
};

const teams: TeamDefinition[] = [
  { id: "technocentre", name: "Technocentre", active: true },
  { id: "support", name: "Soutien spécialisé", active: true }
];

export const employees: Employee[] = [
  { id: "david", displayName: "David Pilote", initials: "DP", jobTitle: "Technicien RI", teamId: "technocentre", role: "admin", active: true },
  { id: "emerick", displayName: "Émerick", initials: "ÉM", jobTitle: "Technicien RI", teamId: "technocentre", role: "employee", active: true },
  { id: "michel", displayName: "Michel", initials: "MI", jobTitle: "Technicien RI", teamId: "technocentre", role: "manager", active: true },
  { id: "fabien", displayName: "Fabien", initials: "FA", jobTitle: "Technicien RI", teamId: "technocentre", role: "employee", active: true },
  { id: "eden", displayName: "Eden", initials: "ED", jobTitle: "Technicien RI", teamId: "technocentre", role: "employee", active: true },
  { id: "patrick", displayName: "Patrick", initials: "PA", jobTitle: "Technicien RI", teamId: "technocentre", role: "employee", active: true },
  { id: "rene", displayName: "René", initials: "RE", jobTitle: "Technicien RI", teamId: "support", role: "manager", active: true },
  { id: "kevin", displayName: "Kevin", initials: "KE", jobTitle: "Technicien RI", teamId: "support", role: "employee", active: true },
  { id: "michael", displayName: "Michaël", initials: "MY", jobTitle: "Technicien RI", teamId: "support", role: "employee", active: true },
  { id: "hani", displayName: "Hani", initials: "HA", jobTitle: "Technicien RI", teamId: "technocentre", role: "employee", active: true }
];

export const assignments: AssignmentDefinition[] = [
  { id: "vnd-am", labelFr: "Soutien aux classes VND", labelEn: "VND classroom support", shortLabelFr: "Classes VND", shortLabelEn: "VND classes", timeLabel: "08:00–12:00", location: "Vandry", category: "classes", minimumStaff: 1, teamId: "technocentre" },
  { id: "vnd-pm", labelFr: "Soutien aux classes VND", labelEn: "VND classroom support", shortLabelFr: "Classes PM", shortLabelEn: "PM classes", timeLabel: "14:30–15:30 · Fri 16:30", location: "Vandry", category: "classes", minimumStaff: 1, teamId: "technocentre" },
  { id: "vnd-soir", labelFr: "Soutien aux classes VND - soir", labelEn: "VND classroom support - evening", shortLabelFr: "Classes soir", shortLabelEn: "Evening classes", timeLabel: "15:30–20:00", location: "Vandry", category: "classes", minimumStaff: 1, teamId: "technocentre", activeWeekdays: [1,2,3,4] },
  { id: "levis", labelFr: "Lévis", labelEn: "Lévis", shortLabelFr: "Lévis", shortLabelEn: "Lévis", location: "Lévis", category: "site", minimumStaff: 0, teamId: "technocentre" },
  { id: "teletravail", labelFr: "Télétravail / Classement", labelEn: "Remote work / Filing", shortLabelFr: "Télétravail", shortLabelEn: "Remote work", category: "remote", minimumStaff: 0, teamId: "technocentre" },
  { id: "erg", labelFr: "Pavillon ERG / Classement", labelEn: "ERG building / Filing", shortLabelFr: "ERG", shortLabelEn: "ERG", timeLabel: "08:00–11:30 / 12:00–16:00", location: "ERG", category: "site", minimumStaff: 1, teamId: "technocentre" },
  { id: "escalade", labelFr: "Escalade", labelEn: "Escalation", shortLabelFr: "Escalade", shortLabelEn: "Escalation", category: "escalation", minimumStaff: 1, teamId: "support" },
  { id: "absence", labelFr: "Congé / absence", labelEn: "Leave / absence", shortLabelFr: "Congé", shortLabelEn: "Leave", category: "absence", minimumStaff: 0, teamId: "technocentre" }
];

const slot = (cycle: "A" | "B", assignmentId: string, weekday: number, employeeIds: string[], note?: string): AssignmentSlot => ({ cycle, assignmentId, weekday, employeeIds, note });

const common = (cycle: "A" | "B"): AssignmentSlot[] => [
  ...[1,2,3,4,5].map((day) => slot(cycle, "vnd-am", day, ["emerick"])),
  slot(cycle, "vnd-soir", 1, ["fabien"]), slot(cycle, "vnd-soir", 2, ["fabien"]), slot(cycle, "vnd-soir", 3, ["fabien"]), slot(cycle, "vnd-soir", 4, ["fabien"]), slot(cycle, "vnd-soir", 5, [], "s.o."),
  slot(cycle, "teletravail", 1, [], "s.o."), slot(cycle, "teletravail", 2, ["hani", "patrick"]), slot(cycle, "teletravail", 3, ["david"]), slot(cycle, "teletravail", 4, ["michel"]), slot(cycle, "teletravail", 5, ["fabien", "eden"]),
  slot(cycle, "erg", 1, ["eden"]), slot(cycle, "erg", 2, ["eden"]), slot(cycle, "erg", 3, ["patrick"]), slot(cycle, "erg", 4, ["eden"]), slot(cycle, "erg", 5, [], "SPRINT"),
  slot(cycle, "escalade", 1, ["rene"]), slot(cycle, "escalade", 2, ["kevin"]), slot(cycle, "escalade", 3, ["kevin"]), slot(cycle, "escalade", 4, ["michael"]), slot(cycle, "escalade", 5, ["michael"])
];

const cycleA: AssignmentSlot[] = [
  ...common("A"),
  slot("A", "vnd-pm", 1, ["michel"]), slot("A", "vnd-pm", 2, ["david"]), slot("A", "vnd-pm", 3, ["eden"]), slot("A", "vnd-pm", 4, ["patrick"]), slot("A", "vnd-pm", 5, ["david"]),
  slot("A", "absence", 1, []), slot("A", "absence", 2, []), slot("A", "absence", 3, []), slot("A", "absence", 4, []), slot("A", "absence", 5, ["michel", "rene"])
];

const cycleB: AssignmentSlot[] = [
  ...common("B"),
  slot("B", "vnd-pm", 1, ["michel"]), slot("B", "vnd-pm", 2, ["david"]), slot("B", "vnd-pm", 3, ["eden"]), slot("B", "vnd-pm", 4, ["patrick"]), slot("B", "vnd-pm", 5, ["patrick"]),
  slot("B", "absence", 1, []), slot("B", "absence", 2, []), slot("B", "absence", 3, []), slot("B", "absence", 4, []), slot("B", "absence", 5, ["michel", "hani"])
];


export const makeDefaultNotification = (teamId: string): DailyBriefSetting => ({
  teamId,
  enabled: false,
  time: "08:00",
  timezone: "America/Toronto",
  channelName: "Général",
  weekdays: [1, 2, 3, 4, 5],
  includeAssignments: true,
  includeAvailability: true,
  includeCoverageWarnings: true,
  language: "organization"
});

export const initialState: AppState = {
  organization,
  teams,
  employees,
  assignments,
  cycleSlots: [...cycleA, ...cycleB],
  exceptions: [],
  requests: [
    { id: "req-1", employeeId: "eden", type: "vacation", startDate: "2026-09-24", endDate: "2026-09-25", note: "", status: "pending", createdAt: "2026-09-10T09:00:00" },
    { id: "req-2", employeeId: "david", type: "remote", startDate: "2026-09-18", endDate: "2026-09-18", note: "Journée de travail à distance", status: "approved", createdAt: "2026-09-09T11:00:00", reviewedBy: "michel" }
  ],
  notifications: [
    { ...makeDefaultNotification("technocentre"), enabled: true, time: "07:45", channelName: "Général" },
    { ...makeDefaultNotification("support"), enabled: false, time: "08:00", channelName: "Général" }
  ]
};

export const createBlankCompanyState = (language: "fr" | "en" = "fr", planId: "free" | "team" | "business" = "free", name = "Compagnie X"): AppState => ({
  organization: { id: `company-${Date.now()}`, name, language, planId, isDemo: false },
  teams: [{ id: "main", name: language === "fr" ? "Équipe principale" : "Main team", active: true }],
  employees: [{ id: "owner", displayName: language === "fr" ? "Administrateur" : "Administrator", initials: "AD", jobTitle: language === "fr" ? "Propriétaire" : "Owner", teamId: "main", role: "owner", active: true }],
  assignments: [],
  cycleSlots: [],
  exceptions: [],
  requests: [],
  notifications: [{ ...makeDefaultNotification("main"), channelName: language === "fr" ? "Général" : "General" }]
});
