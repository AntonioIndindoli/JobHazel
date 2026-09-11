import type {
    DASHBOARD_STATUSES,
    DASHBOARD_TIMEFRAME_OPTIONS,
    INTERVIEW_OUTCOMES,
    INTERVIEW_TYPES,
    APPLICATION_GOAL_PERIOD_OPTIONS,
    STATUSES,
    TASK_TYPES,
    WEEKLY_RANGE_OPTIONS,
} from "./constants";

export type ApplicationStatus = (typeof STATUSES)[number];
export type DashboardStatus = (typeof DASHBOARD_STATUSES)[number];
export type DashboardTimeframe =
    (typeof DASHBOARD_TIMEFRAME_OPTIONS)[number]["value"];
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];
export type TaskType = (typeof TASK_TYPES)[number];
export type WeeklyRangeWeeks = (typeof WEEKLY_RANGE_OPTIONS)[number]["weeks"];
export type ApplicationGoalPeriod =
    (typeof APPLICATION_GOAL_PERIOD_OPTIONS)[number]["value"];
export type ApplicationGoalSettings = {
    target: number;
    period: ApplicationGoalPeriod;
};

export type Mode = "signup" | "login";
export type AuthStatus = "checking" | "signedOut" | "signedIn";
export type DashboardView =
    | "dashboard"
    | "applications"
    | "resumes"
    | "analytics"
    | "interviews"
    | "tasks"
    | "contacts"
    | "settings"
    | "account";

export type Application = {
    id: string;
    title: string;
    status: string;
    source: string | null;
    companyName: string | null;
    createdAt: string;
    sourceUrl: string | null;
    location: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    description: string | null;
    notes: string | null;
    dateApplied: string | null;
    resumeVersionId: string | null;
    resumeVersion: ApplicationResumeSummary | null;
};

export type ApplicationResumeSummary = {
    id: string;
    name: string;
    targetRole: string | null;
    originalFilename: string;
    uploadStatus: ResumeUploadStatus;
    archivedAt: string | null;
};

export type ImportDraft = {
    id: string;
    sourceUrl: string | null;
    sourceDomain: string | null;
    source: string | null;
    pageTitle: string | null;
    rawText: string | null;
    parsedTitle: string | null;
    parsedCompany: string | null;
    parsedLocation: string | null;
    parsedSalaryMin: number | null;
    parsedSalaryMax: number | null;
    parsedDescription: string | null;
    confidence: number | null;
    createdAt: string;
    convertedAt: string | null;
};

export type ParserDebug = Record<string, unknown>;

export type ActivityLog = {
    id: string;
    applicationId: string;
    type: string;
    message: string;
    metadata: unknown | null;
    createdAt: string;
};

export type Interview = {
    id: string;
    applicationId: string;
    type: string;
    scheduledAt: string;
    durationMinutes: number | null;
    location: string | null;
    meetingUrl: string | null;
    interviewerName: string | null;
    notes: string | null;
    outcome: string;
    applicationTitle: string | null;
    companyName: string | null;
    createdAt: string;
    updatedAt: string;
};

export type Task = {
    id: string;
    applicationId: string | null;
    title: string;
    description: string | null;
    dueDate: string | null;
    completedAt: string | null;
    type: string;
    applicationTitle: string | null;
    companyName: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ApplicationFormValues = {
    title: string;
    companyName: string;
    status: string;
    source: string;
    sourceUrl: string;
    location: string;
    salaryMin: string;
    salaryMax: string;
    description: string;
    notes: string;
    dateApplied: string;
    resumeVersionId: string;
};

export type InterviewFormValues = {
    applicationId: string;
    type: string;
    scheduledDate: string;
    scheduledTime: string;
    durationMinutes: string;
    location: string;
    meetingUrl: string;
    interviewerName: string;
    notes: string;
    outcome: string;
};

export type TaskFormValues = {
    title: string;
    description: string;
    applicationId: string;
    dueDate: string;
    type: string;
};

export type TaskAutomationPreferences = {
    autoCreateFollowUpTasks: boolean;
    autoCreateThankYouTasks: boolean;
    followUpTaskDelayDays: number;
    thankYouTaskDelayDays: number;
};

export type Contact = {
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    linkedinUrl: string | null;
    relationship: string;
    notes: string | null;
    companyId: string | null;
    companyName: string | null;
    applicationId: string | null;
    applicationTitle: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ContactFormValues = {
    name: string;
    role: string;
    email: string;
    linkedinUrl: string;
    relationship: string;
    notes: string;
    companyName: string;
    applicationId: string;
};

export type ResumeUploadStatus = "PENDING" | "READY" | "FAILED";

export type ResumeVersion = {
    id: string;
    name: string;
    targetRole: string | null;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string | null;
    uploadStatus: ResumeUploadStatus;
    notes: string | null;
    archivedAt: string | null;
    applicationCount: number;
    createdAt: string;
    updatedAt: string;
};

export type ResumeUploadMetadata = {
    name: string;
    targetRole: string | null;
    originalFilename: string;
    mimeType: "application/pdf";
    sizeBytes: number;
    checksum: string;
    notes: string | null;
};

export type ResumeUploadInitiation = {
    resume: ResumeVersion;
    objectKey: string;
    uploadUrl: string;
    expiresInSeconds: number;
    requiredHeaders: Record<string, string>;
};

export type ResumeMetadataUpdate = {
    name?: string;
    targetRole?: string | null;
    notes?: string | null;
    archived?: boolean;
};

export type ImportCaptureValues = {
    sourceUrl: string;
    pageTitle: string;
    rawText: string;
};

export type ImportReviewValues = {
    title: string;
    companyName: string;
    status: string;
    source: string;
    sourceUrl: string;
    location: string;
    salaryMin: string;
    salaryMax: string;
    description: string;
    notes: string;
    dateApplied: string;
};

export type ApplicationFilters = {
    query: string;
    status: string;
    source: string;
    company: string;
    timeframe: DashboardTimeframe;
};

export type AppIconName =
    | "account"
    | "analytics"
    | "applications"
    | "arrow-left"
    | "arrow-right"
    | "bell"
    | "calendar"
    | "check"
    | "checklist"
    | "chevron-down"
    | "clock"
    | "company"
    | "contacts"
    | "dashboard"
    | "document"
    | "dots-vertical"
    | "edit"
    | "external-link"
    | "filter"
    | "history"
    | "import"
    | "info"
    | "ledger"
    | "location"
    | "logout"
    | "menu"
    | "minus"
    | "moon"
    | "pipeline"
    | "plus"
    | "search"
    | "salary"
    | "settings"
    | "source"
    | "sun"
    | "trash"
    | "trend"
    | "view"
    | "view-off"
    | "warning"
    | "x";

export type IconTone = "blue" | "green" | "purple" | "orange" | "slate";
