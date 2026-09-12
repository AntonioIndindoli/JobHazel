import type {
    AppIconName,
    ApplicationFormValues,
    ApplicationStatus,
    ImportCaptureValues,
    ImportReviewValues,
    InterviewFormValues,
    InterviewOutcome,
    InterviewType,
    TaskFormValues,
    ContactFormValues,
    TaskType,
    WeeklyRangeWeeks,
} from "./types";

export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
export const ACCESS_TOKEN_KEY = "jobappledger_access_token";
export const USER_EMAIL_KEY = "jobappledger_user_email";

export const STATUSES = [
    "SAVED",
    "APPLIED",
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
] as const;

export const DASHBOARD_STATUSES = [
    "SAVED",
    "APPLIED",
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
] as const;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
    SAVED: "Saved",
    APPLIED: "Applied",
    INTERVIEWING: "Interviewing",
    OFFER: "Offer",
    REJECTED: "Rejected",
    WITHDRAWN: "Withdrawn",
};

export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
    SAVED: "#475569",
    APPLIED: "#0066ff",
    INTERVIEWING: "#4f33ff",
    OFFER: "#15803d",
    REJECTED: "#dc2626",
    WITHDRAWN: "#475569",
};

export const INTERVIEW_TYPES = [
    "RECRUITER_SCREEN",
    "TECHNICAL",
    "MANAGER",
    "PANEL",
    "FINAL",
    "TAKE_HOME",
    "OTHER",
] as const;

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
    RECRUITER_SCREEN: "Recruiter Screen",
    TECHNICAL: "Technical",
    MANAGER: "Manager",
    PANEL: "Panel",
    FINAL: "Final",
    TAKE_HOME: "Take Home",
    OTHER: "Other",
};

export const INTERVIEW_OUTCOMES = [
    "SCHEDULED",
    "COMPLETED",
    "PASSED",
    "FAILED",
    "CANCELED",
] as const;

export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
    SCHEDULED: "Scheduled",
    COMPLETED: "Completed",
    PASSED: "Passed",
    FAILED: "Failed",
    CANCELED: "Canceled",
};

export const TASK_TYPES = [
    "FOLLOW_UP",
    "PREP",
    "THANK_YOU",
    "REMINDER",
    "OTHER",
] as const;

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
    FOLLOW_UP: "Follow-Up",
    PREP: "Prep",
    THANK_YOU: "Thank-You",
    REMINDER: "Reminder",
    OTHER: "Other",
};

export const SOURCES = [
    "LinkedIn",
    "Indeed",
    "Greenhouse",
    "Lever",
    "Company Site",
    "Workday",
    "Ashby",
    "Wellfound",
    "Referrals",
    "Recruiter Outreach",
];

export const SOURCE_OPTIONS = ["", ...SOURCES, "Company Careers", "Referral", "Other"];

export const SOURCE_ALIASES: Record<string, string> = {
    "company careers": "Company Site",
    referral: "Referrals",
};

export const SOURCE_DOTS = [
    "#0a66c2",
    "#c026d3",
    "#0f766e",
    "#f97316",
    "#16a34a",
    "#dc2626",
    "#0891b2",
    "#7c3aed",
    "#ca8a04",
    "#475569",
];

export const WEEKLY_RANGE_OPTIONS = [
    { label: "Last 4 weeks", weeks: 4 },
    { label: "Last 6 weeks", weeks: 6 },
    { label: "Last 12 weeks", weeks: 12 },
] as const;

export const DASHBOARD_TIMEFRAME_OPTIONS = [
    { label: "All time", value: "" },
    { label: "1 week", value: "1-week" },
    { label: "1 month", value: "1-month" },
    { label: "3 months", value: "3-months" },
    { label: "6 months", value: "6-months" },
    { label: "1 year", value: "1-year" },
] as const;

export const CONTACT_RELATIONSHIPS = [
    "RECRUITER",
    "REFERRAL",
    "HIRING_MANAGER",
    "EMPLOYEE",
    "OTHER",
] as const;

export const CONTACT_RELATIONSHIP_LABELS: Record<string, string> = {
    RECRUITER: "Recruiter",
    REFERRAL: "Referral",
    HIRING_MANAGER: "Hiring manager",
    EMPLOYEE: "Employee",
    OTHER: "Other",
};

export const DEFAULT_WEEKLY_RANGE: WeeklyRangeWeeks = 6;
export const APPLICATION_GOAL_STORAGE_KEY = "jobappledger_application_goal";
export const APPLICATION_GOAL_PERIOD_OPTIONS = [
    { label: "Daily", value: "daily" },
    { label: "Weekly", value: "weekly" },
    { label: "Monthly", value: "monthly" },
] as const;
export const DEFAULT_APPLICATION_GOAL = {
    target: 5,
    period: "weekly",
} as const;

export const NAV_ITEMS: Array<{ label: string; icon: AppIconName }> = [
    { label: "Dashboard", icon: "dashboard" },
    { label: "Applications", icon: "applications" },
    { label: "Resumes", icon: "document" },
    { label: "Analytics", icon: "analytics" },
    { label: "Interviews", icon: "calendar" },
    { label: "Tasks", icon: "checklist" },
    { label: "Contacts", icon: "contacts" },
    { label: "Settings", icon: "settings" },
];

export const EMPTY_APPLICATION_FORM: ApplicationFormValues = {
    title: "",
    companyName: "",
    status: "APPLIED",
    source: "",
    sourceUrl: "",
    location: "",
    salaryMin: "",
    salaryMax: "",
    description: "",
    notes: "",
    dateApplied: "",
    resumeVersionId: "",
};

export function getTodayDateInput(now = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function createApplicationFormDefaults(now = new Date()): ApplicationFormValues {
    return { ...EMPTY_APPLICATION_FORM, dateApplied: getTodayDateInput(now) };
}

export const EMPTY_INTERVIEW_FORM: InterviewFormValues = {
    applicationId: "",
    type: "RECRUITER_SCREEN",
    scheduledDate: "",
    scheduledTime: "",
    durationMinutes: "30",
    location: "",
    meetingUrl: "",
    interviewerName: "",
    notes: "",
    outcome: "SCHEDULED",
};

export const EMPTY_TASK_FORM: TaskFormValues = {
    title: "",
    description: "",
    applicationId: "",
    dueDate: "",
    type: "FOLLOW_UP",
};

export const EMPTY_CONTACT_FORM: ContactFormValues = {
    name: "",
    role: "",
    email: "",
    linkedinUrl: "",
    relationship: "RECRUITER",
    notes: "",
    companyName: "",
    applicationId: "",
};

export const EMPTY_IMPORT_CAPTURE: ImportCaptureValues = {
    sourceUrl: "",
    pageTitle: "",
    rawText: "",
};

export const EMPTY_IMPORT_REVIEW: ImportReviewValues = {
    title: "",
    companyName: "",
    status: "APPLIED",
    source: "",
    sourceUrl: "",
    location: "",
    salaryMin: "",
    salaryMax: "",
    description: "",
    notes: "",
    dateApplied: "",
};

export function createImportReviewDefaults(now = new Date()): ImportReviewValues {
    return { ...EMPTY_IMPORT_REVIEW, dateApplied: getTodayDateInput(now) };
}

export const WEEKLY_CHART_HEIGHT = 132;
export const WEEKLY_CHART_WIDTH = 540;
