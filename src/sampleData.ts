import type { AppState, AssignmentDefinition, DailyBriefSetting, Employee } from "./types";

export const employees: Employee[] = [];
export const assignments: AssignmentDefinition[] = [];

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

export const createBlankCompanyState = (
  language: "fr" | "en" = "fr",
  planId: "free" | "team" | "business" = "free",
  name = "Mon organisation"
): AppState => ({
  organization: {
    id: `company-${Date.now()}`,
    name,
    language,
    planId,
    isDemo: false
  },
  teams: [
    {
      id: "main",
      name: language === "fr" ? "Équipe principale" : "Main team",
      active: true
    }
  ],
  employees: [
    {
      id: "owner",
      displayName: language === "fr" ? "Administrateur" : "Administrator",
      initials: "AD",
      jobTitle: language === "fr" ? "Propriétaire" : "Owner",
      teamId: "main",
      role: "owner",
      active: true
    }
  ],
  assignments: [],
  cycleSlots: [],
  exceptions: [],
  requests: [],
  notifications: [
    {
      ...makeDefaultNotification("main"),
      channelName: language === "fr" ? "Général" : "General"
    }
  ]
});

// Kept only for compatibility with older UI code. There is no demo data anymore.
export const initialState: AppState = createBlankCompanyState("fr", "free", "Mon organisation");
