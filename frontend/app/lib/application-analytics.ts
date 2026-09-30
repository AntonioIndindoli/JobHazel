import {
    DASHBOARD_STATUSES,
    SOURCE_ALIASES,
    STATUSES,
} from "./constants";
import type {
    ActivityLog,
    Application,
    ApplicationFilters,
    ApplicationStatus,
    AppIconName,
    DashboardStatus,
    DashboardTimeframe,
    IconTone,
    Interview,
    WeeklyRangeWeeks,
} from "./types";

export const ANALYTICS_TIMEFRAME_OPTIONS = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
    { label: "Last 6 months", days: 180 },
    { label: "Last 1 year", days: 365 },
] as const;

export type AnalyticsTimeframeDays =
    (typeof ANALYTICS_TIMEFRAME_OPTIONS)[number]["days"];

export const DEFAULT_ANALYTICS_TIMEFRAME: AnalyticsTimeframeDays = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ACTIVE_APPLICATION_STATUSES = new Set(["APPLIED", "INTERVIEWING", "OFFER"]);
const SUBMITTED_APPLICATION_STATUSES = new Set([
    "APPLIED",
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
]);
const RESPONSE_STATUSES = new Set([
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
]);
const INTERVIEW_STATUSES = new Set(["INTERVIEWING", "OFFER"]);
const OFFER_STATUSES = new Set(["OFFER"]);
const PIPELINE_STATUSES = [
    "APPLIED",
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
] as const;

type PipelineStatus = Exclude<ApplicationStatus, "SAVED">;
export type ApplicationPipelineNode = PipelineStatus | "NO_RESPONSE";

export type AnalyticsKpiCard = {
    label: string;
    value: string | number;
    comparison: string;
    icon: AppIconName;
    tone?: IconTone;
};

export type SourceQualityRow = {
    source: string;
    applications: number;
    submittedApplications: number;
    responses: number;
    responseRate: number;
    interviews: number;
    interviewRate: number;
    offers: number;
    averageDaysToResponse: number | null;
};

export function normalizeSource(source: string | null) {
    if (!source) return null;
    const normalized = source.trim().toLowerCase();
    return SOURCE_ALIASES[normalized] ?? source.trim();
}

export function getApplicationTimestamp(app: Application) {
    const rawDate = app.dateApplied ?? app.createdAt;
    const timestamp = new Date(rawDate).getTime();
    return Number.isNaN(timestamp) ? new Date(app.createdAt).getTime() : timestamp;
}

function getStartOfWeek(date: Date) {
    const weekStart = new Date(date);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return weekStart;
}

function subtractCalendarMonths(date: Date, monthCount: number) {
    const originalDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() - monthCount);

    const lastDayOfTargetMonth = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
    ).getDate();
    date.setDate(Math.min(originalDay, lastDayOfTargetMonth));
}

export function getTimeframeStartTimestamp(
    timeframe: DashboardTimeframe,
    now = new Date(),
) {
    if (!timeframe) return null;

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (timeframe === "1-week") start.setDate(start.getDate() - 7);
    if (timeframe === "1-month") subtractCalendarMonths(start, 1);
    if (timeframe === "3-months") subtractCalendarMonths(start, 3);
    if (timeframe === "6-months") subtractCalendarMonths(start, 6);
    if (timeframe === "1-year") subtractCalendarMonths(start, 12);

    return start.getTime();
}

export function filterApplicationsByTimeframe(
    applications: Application[],
    timeframe: DashboardTimeframe,
    now = new Date(),
) {
    const startTimestamp = getTimeframeStartTimestamp(timeframe, now);
    if (startTimestamp === null) return applications;

    const endTimestamp = now.getTime();
    return applications.filter((application) => {
        const timestamp = getApplicationTimestamp(application);
        return timestamp >= startTimestamp && timestamp <= endTimestamp;
    });
}

function getMetadataObject(metadata: ActivityLog["metadata"]) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    return metadata as Record<string, unknown>;
}

function sortHistoryChronologically(history: ActivityLog[]) {
    return [...history].sort(
        (first, second) =>
            new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
    );
}

function getStatusValue(status: unknown) {
    return typeof status === "string" && isApplicationStatus(status) ? status : null;
}

function isPipelineStatus(status: string): status is PipelineStatus {
    return (
        isApplicationStatus(status) &&
        (PIPELINE_STATUSES as readonly string[]).includes(status)
    );
}

function appendStatus(
    sequence: ApplicationStatus[],
    status: ApplicationStatus | null,
) {
    if (!status || sequence.at(-1) === status) return;
    sequence.push(status);
}

function getStatusChange(entry: ActivityLog) {
    if (entry.type !== "STATUS_CHANGED") return null;
    const metadata = getMetadataObject(entry.metadata);
    if (!metadata) return null;

    const from = getStatusValue(metadata.from);
    const to = getStatusValue(metadata.to);
    if (!from || !to) return null;

    return { from, to };
}

function getCreatedStatus(history: ActivityLog[]) {
    const createdEntry = history.find((entry) => entry.type === "APPLICATION_CREATED");
    const metadata = getMetadataObject(createdEntry?.metadata ?? null);
    return getStatusValue(metadata?.status);
}

export function buildApplicationPipelinePath(
    application: Application,
    history: ActivityLog[] = [],
): ApplicationPipelineNode[] {
    const currentStatus = getStatusValue(application.status);
    if (!currentStatus || !isPipelineStatus(currentStatus)) return [];

    const chronologicalHistory = sortHistoryChronologically(history);
    const observedStatuses: ApplicationStatus[] = [];
    chronologicalHistory.forEach((entry) => {
        const statusChange = getStatusChange(entry);
        if (!statusChange) return;
        appendStatus(observedStatuses, statusChange.from);
        appendStatus(observedStatuses, statusChange.to);
    });

    if (!observedStatuses.length) {
        appendStatus(observedStatuses, getCreatedStatus(chronologicalHistory));
    }
    appendStatus(observedStatuses, currentStatus);

    const reachedInterview =
        currentStatus === "INTERVIEWING" ||
        currentStatus === "OFFER" ||
        observedStatuses.some(
            (status) => status === "INTERVIEWING" || status === "OFFER",
        );

    if (currentStatus === "APPLIED") return ["APPLIED", "NO_RESPONSE"];

    if (currentStatus === "INTERVIEWING") {
        return ["APPLIED", "INTERVIEWING"];
    }

    if (currentStatus === "OFFER") {
        return ["APPLIED", "INTERVIEWING", "OFFER"];
    }

    if (currentStatus === "REJECTED") {
        return reachedInterview
            ? ["APPLIED", "INTERVIEWING", "REJECTED"]
            : ["APPLIED", "REJECTED"];
    }

    return reachedInterview
        ? ["APPLIED", "INTERVIEWING", "WITHDRAWN"]
        : ["APPLIED", "WITHDRAWN"];
}

function applicationReachedStatus(
    application: Application,
    history: ActivityLog[],
    statuses: Set<string>,
) {
    const path = buildApplicationPipelinePath(application, history);
    return path.some((status) => statuses.has(status));
}

function getApplicationStatusAt(
    application: Application,
    history: ActivityLog[],
    timestamp: number,
) {
    if (new Date(application.createdAt).getTime() > timestamp) return null;

    const chronologicalHistory = sortHistoryChronologically(history);
    const createdEntry = chronologicalHistory.find(
        (entry) => entry.type === "APPLICATION_CREATED",
    );
    const createdMetadata = getMetadataObject(createdEntry?.metadata ?? null);
    let status = getStatusValue(createdMetadata?.status) ?? application.status;

    chronologicalHistory.forEach((entry) => {
        const entryTime = new Date(entry.createdAt).getTime();
        if (entryTime > timestamp || entry.type !== "STATUS_CHANGED") return;

        const metadata = getMetadataObject(entry.metadata);
        status = getStatusValue(metadata?.to) ?? status;
    });

    return status;
}

function countActiveApplicationsAt(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
    date: Date,
) {
    const timestamp = date.getTime();

    return applications.filter((application) => {
        const status = getApplicationStatusAt(
            application,
            historyByApp[application.id] ?? [],
            timestamp,
        );
        return Boolean(status && ACTIVE_APPLICATION_STATUSES.has(status));
    }).length;
}

function getDateRange(end: Date, days: number) {
    const rangeEnd = new Date(end);
    const rangeStart = new Date(rangeEnd);
    rangeStart.setDate(rangeStart.getDate() - days);
    return { start: rangeStart, end: rangeEnd };
}

function isTimestampInRange(timestamp: number, start: Date, end: Date) {
    return timestamp >= start.getTime() && timestamp < end.getTime();
}

function getApplicationsInRange(
    applications: Application[],
    start: Date,
    end: Date,
) {
    return applications.filter((application) =>
        isTimestampInRange(getApplicationTimestamp(application), start, end),
    );
}

function calculateRate(count: number, total: number) {
    if (!total) return 0;
    return Math.round((count / total) * 100);
}

function formatComparison(
    current: number,
    previous: number,
    label: string,
    valueFormatter: (value: number) => string = (value) => String(value),
) {
    if (!previous) {
        return current ? `Up from ${valueFormatter(0)} ${label}` : `No change ${label}`;
    }

    const percentChange = Math.round(((current - previous) / previous) * 100);
    return `${percentChange > 0 ? "+" : ""}${percentChange}% ${label}`;
}

function getFirstStatusTimestamp(
    application: Application,
    history: ActivityLog[],
    statuses: Set<string>,
) {
    if (!applicationReachedStatus(application, history, statuses)) return null;

    const chronologicalHistory = sortHistoryChronologically(history);
    const statusTimes: number[] = [];

    chronologicalHistory.forEach((entry) => {
        const entryTime = new Date(entry.createdAt).getTime();
        if (Number.isNaN(entryTime)) return;

        const metadata = getMetadataObject(entry.metadata);
        if (entry.type === "APPLICATION_CREATED") {
            const createdStatus = getStatusValue(metadata?.status);
            if (createdStatus && statuses.has(createdStatus)) statusTimes.push(entryTime);
            return;
        }

        if (entry.type !== "STATUS_CHANGED") return;

        const nextStatus = getStatusValue(metadata?.to);
        if (nextStatus && statuses.has(nextStatus)) statusTimes.push(entryTime);
    });

    if (statusTimes.length) return Math.min(...statusTimes);
    return getApplicationTimestamp(application);
}

function getFirstResponseTimestamp(application: Application, history: ActivityLog[]) {
    // Import/creation time is not the time an employer responded. Only recorded
    // response events with a known application date contribute to timing.
    const appliedTime = application.dateApplied ? Date.parse(application.dateApplied) : NaN;
    if (!Number.isFinite(appliedTime)) return null;
    const responseTimes: number[] = [];

    sortHistoryChronologically(history).forEach((entry) => {
        const entryTime = new Date(entry.createdAt).getTime();
        if (Number.isNaN(entryTime) || entryTime < appliedTime) return;

        if (entry.type === "INTERVIEW_ADDED") {
            responseTimes.push(entryTime);
            return;
        }

        if (entry.type !== "STATUS_CHANGED") {
            return;
        }

        const metadata = getMetadataObject(entry.metadata);
        const status = getStatusValue(metadata?.to);
        if (status && RESPONSE_STATUSES.has(status)) responseTimes.push(entryTime);
    });

    if (responseTimes.length) return Math.min(...responseTimes);
    return null;
}

function hasEmployerResponse(application: Application, history: ActivityLog[], interviewsByApplicationId: Set<string>) {
    return RESPONSE_STATUSES.has(application.status) ||
        history.some((entry) => {
            const metadata = getMetadataObject(entry.metadata);
            return entry.type === "STATUS_CHANGED"
                ? RESPONSE_STATUSES.has(String(metadata?.from)) || RESPONSE_STATUSES.has(String(metadata?.to))
                : entry.type === "APPLICATION_CREATED" && RESPONSE_STATUSES.has(String(metadata?.status));
        }) ||
        interviewsByApplicationId.has(application.id) ||
        history.some((entry) => entry.type === "INTERVIEW_ADDED");
}

function getAverageDaysToResponse(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
) {
    const responseDurations = applications.flatMap((application) => {
        const appliedTime = getApplicationTimestamp(application);
        const responseTime = getFirstResponseTimestamp(
            application,
            historyByApp[application.id] ?? [],
        );

        if (responseTime === null) return [];
        return [Math.max(0, (responseTime - appliedTime) / DAY_IN_MS)];
    });

    if (!responseDurations.length) return null;

    return (
        responseDurations.reduce((sum, duration) => sum + duration, 0) /
        responseDurations.length
    );
}

function hasInterview(
    application: Application,
    history: ActivityLog[],
    interviewsByApplicationId: Set<string>,
) {
    return (
        interviewsByApplicationId.has(application.id) ||
        applicationReachedStatus(application, history, INTERVIEW_STATUSES)
    );
}

function getSubmittedApplications(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
) {
    return applications.filter((application) =>
        applicationReachedStatus(
            application,
            historyByApp[application.id] ?? [],
            SUBMITTED_APPLICATION_STATUSES,
        ),
    );
}

function buildPeriodMetrics(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
    interviewsByApplicationId: Set<string>,
) {
    const submittedApplications = getSubmittedApplications(applications, historyByApp);
    const responseCount = submittedApplications.filter((application) =>
        hasEmployerResponse(
            application,
            historyByApp[application.id] ?? [],
            interviewsByApplicationId,
        ),
    ).length;
    const interviewCount = submittedApplications.filter((application) =>
        hasInterview(
            application,
            historyByApp[application.id] ?? [],
            interviewsByApplicationId,
        ),
    ).length;

    return {
        responseRate: calculateRate(responseCount, submittedApplications.length),
        interviewRate: calculateRate(interviewCount, submittedApplications.length),
        averageDaysToResponse: getAverageDaysToResponse(
            submittedApplications,
            historyByApp,
        ),
    };
}

export function buildSourceQualityRows(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
    interviews: Interview[],
) {
    const interviewsByApplicationId = new Set(
        interviews.map((interview) => interview.applicationId),
    );
    const sourceGroups = applications.reduce((groups, application) => {
        const source = normalizeSource(application.source) ?? "No source";
        const group = groups.get(source) ?? [];
        group.push(application);
        groups.set(source, group);
        return groups;
    }, new Map<string, Application[]>());

    return Array.from(sourceGroups.entries())
        .map(([source, sourceApplications]) => {
            const submittedApplications = getSubmittedApplications(
                sourceApplications,
                historyByApp,
            );
            const responses = submittedApplications.filter((application) =>
                hasEmployerResponse(
                    application,
                    historyByApp[application.id] ?? [],
                    interviewsByApplicationId,
                ),
            ).length;
            const interviewsCount = submittedApplications.filter((application) =>
                hasInterview(
                    application,
                    historyByApp[application.id] ?? [],
                    interviewsByApplicationId,
                ),
            ).length;
            const offers = sourceApplications.filter((application) =>
                applicationReachedStatus(
                    application,
                    historyByApp[application.id] ?? [],
                    OFFER_STATUSES,
                ),
            ).length;

            return {
                source,
                applications: sourceApplications.length,
                submittedApplications: submittedApplications.length,
                responses,
                responseRate: calculateRate(
                    responses,
                    submittedApplications.length,
                ),
                interviews: interviewsCount,
                interviewRate: calculateRate(
                    interviewsCount,
                    submittedApplications.length,
                ),
                offers,
                averageDaysToResponse: getAverageDaysToResponse(
                    submittedApplications,
                    historyByApp,
                ),
            };
        })
        .sort(
            (first, second) =>
                second.interviews - first.interviews ||
                second.offers - first.offers ||
                second.responseRate - first.responseRate ||
                second.applications - first.applications ||
                first.source.localeCompare(second.source),
        ) satisfies SourceQualityRow[];
}

function countOffersInRange(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
    start: Date,
    end: Date,
) {
    return applications.filter((application) => {
        const offerTime = getFirstStatusTimestamp(
            application,
            historyByApp[application.id] ?? [],
            OFFER_STATUSES,
        );
        return offerTime !== null && isTimestampInRange(offerTime, start, end);
    }).length;
}

function formatDays(value: number | null) {
    if (value === null) return "N/A";
    if (value < 1) return "<1 day";
    const rounded = Math.round(value * 10) / 10;
    return `${rounded} ${rounded === 1 ? "day" : "days"}`;
}

export function formatDaysToResponse(value: number | null) {
    return formatDays(value);
}

function formatWeekLabel(date: Date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function buildWeeklyApplications(
    applications: Application[],
    weekCount: WeeklyRangeWeeks,
) {
    const thisWeekStart = getStartOfWeek(new Date());
    const weeks = Array.from({ length: weekCount }, (_, index) => {
        const start = new Date(thisWeekStart);
        start.setDate(thisWeekStart.getDate() - (weekCount - 1 - index) * 7);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return { start, end, label: formatWeekLabel(start), count: 0 };
    });

    applications.forEach((app) => {
        const timestamp = getApplicationTimestamp(app);
        const week = weeks.find(
            ({ start, end }) => timestamp >= start.getTime() && timestamp < end.getTime(),
        );
        if (week) week.count += 1;
    });

    const total = weeks.reduce((sum, week) => sum + week.count, 0);
    const comparisonWeeks = weekCount / 2;
    const previousPeriod = weeks
        .slice(0, comparisonWeeks)
        .reduce((sum, week) => sum + week.count, 0);
    const latestPeriod = weeks
        .slice(comparisonWeeks)
        .reduce((sum, week) => sum + week.count, 0);
    const delta = latestPeriod - previousPeriod;
    const trend =
        delta === 0
            ? "No change"
            : `${delta > 0 ? "+" : ""}${delta} vs previous ${comparisonWeeks} weeks`;

    return { weeks, total, trend };
}

export function isApplicationStatus(status: string): status is ApplicationStatus {
    return (STATUSES as readonly string[]).includes(status);
}

export function countApplicationsByStatus(applications: Application[]) {
    const counts = Object.fromEntries(
        STATUSES.map((status) => [status, 0]),
    ) as Record<ApplicationStatus, number>;

    applications.forEach((app) => {
        if (isApplicationStatus(app.status)) counts[app.status] += 1;
    });

    return counts;
}

export function filterApplications(
    applications: Application[],
    filters: ApplicationFilters,
) {
    const queryFilter = filters.query.trim().toLowerCase();
    const companyFilter = filters.company.trim().toLowerCase();
    const timeframeStart = getTimeframeStartTimestamp(filters.timeframe);
    const timeframeEnd = Date.now();

    return applications.filter((app) => {
        const searchableText = [
            app.title,
            app.companyName,
            app.location,
            app.source,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        if (queryFilter && !searchableText.includes(queryFilter)) return false;
        if (filters.status && app.status !== filters.status) return false;
        if (
            filters.source &&
            app.source?.toLowerCase() !== filters.source.toLowerCase()
        )
            return false;
        if (
            companyFilter &&
            ![app.companyName, app.title]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(companyFilter)
        )
            return false;
        if (timeframeStart !== null) {
            const applicationTimestamp = getApplicationTimestamp(app);
            if (
                applicationTimestamp < timeframeStart ||
                applicationTimestamp > timeframeEnd
            )
                return false;
        }

        return true;
    });
}

export function groupDashboardApplications(applications: Application[]) {
    return Object.fromEntries(
        DASHBOARD_STATUSES.map((status) => [
            status,
            applications.filter((app) => app.status === status),
        ]),
    ) as Record<DashboardStatus, Application[]>;
}

export function countActiveApplications(applications: Application[]) {
    return applications.filter(
        (app) => !["SAVED", "REJECTED", "WITHDRAWN"].includes(app.status),
    ).length;
}

export function buildAnalyticsKpiCards(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
    interviews: Interview[],
    timeframeDays: AnalyticsTimeframeDays = DEFAULT_ANALYTICS_TIMEFRAME,
) {
    const now = new Date();
    const currentPeriod = getDateRange(now, timeframeDays);
    const previousPeriod = getDateRange(currentPeriod.start, timeframeDays);
    const timeframeLabel =
        ANALYTICS_TIMEFRAME_OPTIONS.find(
            (option) => option.days === timeframeDays,
        )?.label.replace("Last ", "").toLowerCase() ?? `${timeframeDays} days`;
    const priorPeriodLabel = `vs prior ${timeframeLabel}`;

    const currentPeriodApplications = getApplicationsInRange(
        applications,
        currentPeriod.start,
        currentPeriod.end,
    );
    const previousPeriodApplications = getApplicationsInRange(
        applications,
        previousPeriod.start,
        previousPeriod.end,
    );
    const interviewsByApplicationId = new Set(
        interviews.map((interview) => interview.applicationId),
    );
    const currentPeriodMetrics = buildPeriodMetrics(
        currentPeriodApplications,
        historyByApp,
        interviewsByApplicationId,
    );
    const previousPeriodMetrics = buildPeriodMetrics(
        previousPeriodApplications,
        historyByApp,
        interviewsByApplicationId,
    );
    const currentOffers = countOffersInRange(
        applications,
        historyByApp,
        currentPeriod.start,
        currentPeriod.end,
    );
    const previousOffers = countOffersInRange(
        applications,
        historyByApp,
        previousPeriod.start,
        previousPeriod.end,
    );
    const activeApplications = countActiveApplications(applications);
    const activeApplicationsAtPeriodStart = countActiveApplicationsAt(
        applications,
        historyByApp,
        currentPeriod.start,
    );
    const currentAverageDays = currentPeriodMetrics.averageDaysToResponse;
    const previousAverageDays = previousPeriodMetrics.averageDaysToResponse;
    const averageDaysComparison =
        currentAverageDays === null
            ? "Response timing unavailable"
            : previousAverageDays === null
                ? "No prior responses"
                : formatComparison(
                    currentAverageDays ?? 0,
                    previousAverageDays,
                    priorPeriodLabel,
                    formatDays,
                );

    return [
        {
            label: "Active applications",
            value: activeApplications,
            comparison: formatComparison(
                activeApplications,
                activeApplicationsAtPeriodStart,
                `vs ${timeframeLabel} ago`,
            ),
            icon: "trend",
            tone: "green",
        },
        {
            label: "Applications",
            value: currentPeriodApplications.length,
            comparison: formatComparison(
                currentPeriodApplications.length,
                previousPeriodApplications.length,
                priorPeriodLabel,
            ),
            icon: "applications",
        },
        {
            label: "Response rate",
            value: `${currentPeriodMetrics.responseRate}%`,
            comparison: formatComparison(
                currentPeriodMetrics.responseRate,
                previousPeriodMetrics.responseRate,
                priorPeriodLabel,
                (value) => `${value}%`,
            ),
            icon: "clock",
            tone: "orange",
        },
        {
            label: "Interview rate",
            value: `${currentPeriodMetrics.interviewRate}%`,
            comparison: formatComparison(
                currentPeriodMetrics.interviewRate,
                previousPeriodMetrics.interviewRate,
                priorPeriodLabel,
                (value) => `${value}%`,
            ),
            icon: "contacts",
            tone: "purple",
        },
        {
            label: "Offers received",
            value: currentOffers,
            comparison: formatComparison(
                currentOffers,
                previousOffers,
                priorPeriodLabel,
            ),
            icon: "check",
            tone: "green",
        },
        {
            label: "Average days to response",
            value: formatDays(currentAverageDays),
            comparison: averageDaysComparison,
            icon: "history",
            tone: "slate",
        },
    ] satisfies AnalyticsKpiCard[];
}
