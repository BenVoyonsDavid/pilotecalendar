export type CycleType = "A" | "B";
export type Language = "fr" | "en";
export type PlanId = "free" | "team" | "business";
export type UserRole = "owner" | "admin" | "manager" | "employee" | "viewer";
export type RequestType = "vacation" | "absence" | "remote";
export type RequestStatus = "pending" | "approved" | "rejected";
export type NotificationLanguage = "organization" | "fr" | "en";

export interface Organization { id:string; name:string; language:Language; planId:PlanId; isDemo:boolean; }
export interface TeamDefinition { id:string; name:string; active:boolean; microsoftTeamId?:string; microsoftChannelId?:string; microsoftChannelName?:string; }
export interface Employee { id:string; displayName:string; initials:string; jobTitle:string; teamId:string; role:UserRole; active:boolean; microsoftUserId?:string; }
export interface AssignmentDefinition { id:string; labelFr:string; labelEn:string; shortLabelFr:string; shortLabelEn:string; timeLabel?:string; location?:string; category:"classes"|"remote"|"site"|"escalation"|"absence"|"other"; minimumStaff:number; teamId:string; activeWeekdays?:number[]; }
export interface AssignmentSlot { cycle:CycleType; assignmentId:string; weekday:number; employeeIds:string[]; note?:string; }
export interface AssignmentException { date:string; assignmentId:string; employeeIds:string[]; note?:string; }
export interface ScheduleRequest { id:string; employeeId:string; type:RequestType; startDate:string; endDate:string; note?:string; status:RequestStatus; createdAt:string; reviewedBy?:string; }
export interface DailyBriefSetting { teamId:string; enabled:boolean; time:string; timezone:string; channelName:string; channelId?:string; weekdays:number[]; includeAssignments:boolean; includeAvailability:boolean; includeCoverageWarnings:boolean; language:NotificationLanguage; }
export interface AppState { organization:Organization; teams:TeamDefinition[]; employees:Employee[]; assignments:AssignmentDefinition[]; cycleSlots:AssignmentSlot[]; exceptions:AssignmentException[]; requests:ScheduleRequest[]; notifications:DailyBriefSetting[]; }
export interface TeamsInstallation { tenantId?:string; teamId?:string; channelId?:string; channelName?:string; conversationId:string; serviceUrl?:string; updatedAt:string; }
export interface RuntimeStore { state?:AppState; installations:TeamsInstallation[]; sentKeys:string[]; }
