"use client";

import { useMemo, useRef, useState } from "react";

import {
    countApplicationsByStatus,
    getApplicationTimestamp,
    isApplicationStatus,
} from "../lib/application-analytics";
import {
    formatInterviewDateTime,
    formatInterviewDuration,
    getInterviewOutcomeLabel,
    getInterviewTypeLabel,
    sortInterviewsBySchedule,
} from "../lib/interview-utils";
import { formatTaskDueDate, getTaskDueState, sortTasksByDueDate } from "../lib/task-utils";
import { SOURCES, STATUSES, STATUS_LABELS } from "../lib/constants";
import type { Application, Interview, Task } from "../lib/types";
import { AppIcon } from "./AppIcon";

type ApplicationsViewProps = {
    applications: Application[];
    focusedApplicationId?: string | null;
    interviews: Interview[];
    tasks: Task[];
    onCreateApplication: () => void;
    onCreateInterview: (applicationId?: string) => void;
    onCreateTask: (applicationId?: string) => void;
    onCompleteTask: (id: string) => void | Promise<void>;
    onRemoveApplication: (id: string) => void;
    onRemoveInterview: (id: string) => void | Promise<void>;
    onStartEdit: (application: Application) => void;
    onStartEditInterview: (interview: Interview) => void;
    onStatusChange: (id: string, status: string) => void;
    onUpdateNotes: (application: Application, notes: string) => Promise<void>;
    onViewInterview: (interviewId: string) => void;
};

type ApplicationsTableFilters = {
    query: string;
    status: string;
    source: string;
    startDate: string;
    endDate: string;
};

type SortKey =
    | "title"
    | "companyName"
    | "status"
    | "source"
    | "location"
    | "dateApplied";

type SortDirection = "asc" | "desc";

const INITIAL_FILTERS: ApplicationsTableFilters = {
    query: "",
    status: "",
    source: "",
    startDate: "",
    endDate: "",
};

function formatDisplayDate(value: string | null) {
    if (!value) return "Not set";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not set";

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function formatFilterDate(value: string) {
    if (!value) return "";
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatSalaryRange(application: Application) {
    const { salaryMin, salaryMax } = application;
    const moneyFormatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    });

    if (salaryMin !== null && salaryMax !== null) {
        return `${moneyFormatter.format(salaryMin)} - ${moneyFormatter.format(
            salaryMax,
        )}`;
    }

    if (salaryMin !== null) return `From ${moneyFormatter.format(salaryMin)}`;
    if (salaryMax !== null) return `Up to ${moneyFormatter.format(salaryMax)}`;

    return "Salary not specified";
}

function formatTaskRemaining(value: string | null) {
    if (!value) return "";
    const due = new Date(`${value.slice(0, 10)}T23:59:59`);
    if (Number.isNaN(due.getTime())) return "";
    const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    if (days === 0) return "Due today";
    return `${days} day${days === 1 ? "" : "s"} remaining`;
}

function getSortValue(application: Application, sortKey: SortKey) {
    if (sortKey === "dateApplied") return getApplicationTimestamp(application);
    if (sortKey === "status") return getStatusLabel(application.status);

    return (application[sortKey] ?? "").toString().toLowerCase();
}

function getStatusLabel(status: string) {
    return isApplicationStatus(status) ? STATUS_LABELS[status] : status;
}

function getInterviewLocationLabel(interview: Interview) {
    const location = interview.location?.trim();
    if (location) return location;
    if (interview.meetingUrl?.trim()) return "Meeting link saved";
    return "Location not set";
}

export function ApplicationsView({
    applications,
    focusedApplicationId,
    interviews,
    tasks,
    onCreateApplication,
    onCreateInterview,
    onCreateTask,
    onCompleteTask,
    onRemoveApplication,
    onRemoveInterview,
    onStartEdit,
    onStartEditInterview,
    onStatusChange,
    onUpdateNotes,
    onViewInterview,
}: ApplicationsViewProps) {
    const [filters, setFilters] =
        useState<ApplicationsTableFilters>(INITIAL_FILTERS);
    const [sortKey, setSortKey] = useState<SortKey>("dateApplied");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [isApplicationMenuOpen, setIsApplicationMenuOpen] = useState(false);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notesDraft, setNotesDraft] = useState("");
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [openInterviewMenuId, setOpenInterviewMenuId] = useState<string | null>(null);
    const [isAppliedDateOpen, setIsAppliedDateOpen] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(
        Boolean(focusedApplicationId),
    );
    const listScrollPosition = useRef(0);
    const [selectedApplicationId, setSelectedApplicationId] = useState<
        string | null
    >(focusedApplicationId ?? null);
    const sourceOptions = useMemo(() => {
        const sources = new Set<string>(SOURCES);
        applications.forEach((application) => {
            if (application.source) sources.add(application.source);
        });
        return Array.from(sources).sort((a, b) => a.localeCompare(b));
    }, [applications]);
    const applicationStatusSummary = useMemo(() => {
        const counts = countApplicationsByStatus(applications);
        const populatedStatuses = STATUSES.filter((status) => counts[status] > 0);
        const statusesToShow =
            populatedStatuses.length > 0 ? populatedStatuses : STATUSES;

        return statusesToShow.map((status) => ({
            status,
            count: counts[status],
            label: STATUS_LABELS[status].toLowerCase(),
        }));
    }, [applications]);

    const filteredApplications = useMemo(() => {
        const query = filters.query.trim().toLowerCase();
        const startTime = filters.startDate
            ? new Date(`${filters.startDate}T00:00:00`).getTime()
            : null;
        const endTime = filters.endDate
            ? new Date(`${filters.endDate}T23:59:59`).getTime()
            : null;

        return applications.filter((application) => {
            const searchableText = [
                application.title,
                application.companyName,
                application.location,
                application.source,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            if (query && !searchableText.includes(query)) return false;
            if (filters.status && application.status !== filters.status) return false;
            if (
                filters.source &&
                application.source?.toLowerCase() !== filters.source.toLowerCase()
            )
                return false;

            const applicationTime = getApplicationTimestamp(application);
            if (startTime !== null && applicationTime < startTime) return false;
            if (endTime !== null && applicationTime > endTime) return false;

            return true;
        });
    }, [applications, filters]);

    const sortedApplications = useMemo(() => {
        return [...filteredApplications].sort((left, right) => {
            const leftValue = getSortValue(left, sortKey);
            const rightValue = getSortValue(right, sortKey);
            const directionMultiplier = sortDirection === "asc" ? 1 : -1;

            if (typeof leftValue === "number" && typeof rightValue === "number") {
                return (leftValue - rightValue) * directionMultiplier;
            }

            return String(leftValue).localeCompare(String(rightValue)) * directionMultiplier;
        });
    }, [filteredApplications, sortDirection, sortKey]);

    const selectedApplication =
        sortedApplications.find(
            (application) => application.id === selectedApplicationId,
        ) ??
        sortedApplications[0] ??
        null;
    const selectedNotes = selectedApplication?.notes?.trim() ?? "";
    const selectedApplicationIdForInterviews = selectedApplication?.id ?? null;
    const selectedInterviews = selectedApplicationIdForInterviews
        ? sortInterviewsBySchedule(
            interviews.filter(
                (interview) =>
                    interview.applicationId === selectedApplicationIdForInterviews,
            ),
            "asc",
        )
        : [];
    const selectedTasks = selectedApplication
        ? sortTasksByDueDate(
            tasks.filter(
                (task) =>
                    task.applicationId === selectedApplication.id && !task.completedAt,
            ),
        )
        : [];
    const nextTask = selectedTasks[0] ?? null;
    const activeFilterCount = [
        filters.status,
        filters.source,
        filters.startDate || filters.endDate,
    ].filter(Boolean).length;
    const nextActionByApplication = useMemo(() => {
        const nextActions = new Map<string, { label: string; timestamp: number }>();
        const now = Date.now();

        interviews.forEach((interview) => {
            const timestamp = new Date(interview.scheduledAt).getTime();
            if (!Number.isFinite(timestamp) || timestamp < now) return;
            const current = nextActions.get(interview.applicationId);
            if (!current || timestamp < current.timestamp) {
                nextActions.set(interview.applicationId, {
                    label: `Interview ${formatDisplayDate(interview.scheduledAt).replace(/, \d{4}$/, "")}`,
                    timestamp,
                });
            }
        });

        tasks.filter((task) => !task.completedAt).forEach((task) => {
            if (!task.applicationId || !task.dueDate) return;
            const timestamp = new Date(`${task.dueDate.slice(0, 10)}T23:59:59`).getTime();
            if (!Number.isFinite(timestamp) || timestamp < now) return;
            const current = nextActions.get(task.applicationId);
            if (!current || timestamp < current.timestamp) {
                nextActions.set(task.applicationId, {
                    label: `${task.title} ${formatDisplayDate(task.dueDate).replace(/, \d{4}$/, "")}`,
                    timestamp,
                });
            }
        });

        return nextActions;
    }, [interviews, tasks]);

    function openMobileDetail(applicationId: string) {
        listScrollPosition.current = window.scrollY;
        setSelectedApplicationId(applicationId);
        setIsEditingNotes(false);
        setIsMobileDetailOpen(true);
        requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }

    function closeMobileDetail() {
        setIsMobileDetailOpen(false);
        requestAnimationFrame(() =>
            window.scrollTo({ top: listScrollPosition.current, behavior: "auto" }),
        );
    }
    function updateSort(nextSortKey: SortKey) {
        if (nextSortKey === sortKey) {
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
        }

        setSortKey(nextSortKey);
        setSortDirection(nextSortKey === "dateApplied" ? "desc" : "asc");
    }

    function renderSortButton(label: string, nextSortKey: SortKey) {
        const isActive = sortKey === nextSortKey;

        return (
            <button
                type="button"
                className={isActive ? "table-sort-button active" : "table-sort-button"}
                onClick={() => updateSort(nextSortKey)}
                aria-label={`Sort by ${label}${isActive ? `, currently ${sortDirection === "asc" ? "ascending" : "descending"}` : ""}`}
                aria-pressed={isActive}
            >
                <span>{label}</span>
                <AppIcon
                    name="chevron-down"
                    size={14}
                    className={
                        isActive && sortDirection === "asc"
                            ? "sort-icon ascending"
                            : "sort-icon"
                    }
                />
            </button>
        );
    }

    return (
        <section className={isMobileDetailOpen ? "applications-page mobile-page-detail-open" : "applications-page"}>
            <div className="page-summary">
                <span
                    className="applications-status-meta"
                    aria-label="Application totals by status"
                >
                    {applicationStatusSummary.map(({ status, count, label }) => (
                        <strong
                            key={status}
                            className={`applications-status-count ${status.toLowerCase()}`}
                        >
                            {count} {label}
                        </strong>
                    ))}
                </span>
            </div>

            <div className={isMobileDetailOpen ? "applications-split-panel mobile-detail-open" : "applications-split-panel"}>
                <aside className="application-list-panel">

                    <div className={isFiltersOpen ? "applications-toolbar mobile-filters-open" : "applications-toolbar"} aria-label="Application table filters">
                        <label className="applications-search-field">
                            <AppIcon name="search" size={18} />
                            <input
                                aria-label="Search applications"
                                value={filters.query}
                                onChange={(event) =>
                                    setFilters({ ...filters, query: event.target.value })
                                }
                                placeholder="Search title, company, location, source"
                            />
                        </label>
                        <button
                            type="button"
                            className="mobile-filter-toggle"
                            aria-expanded={isFiltersOpen}
                            onClick={() => setIsFiltersOpen((open) => !open)}
                        >
                            <AppIcon name="filter" size={18} />
                            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
                        </button>
                        <select
                            value={filters.status}
                            onChange={(event) =>
                                setFilters({ ...filters, status: event.target.value })
                            }
                        >
                            <option value="">All statuses</option>
                            {STATUSES.map((status) => (
                                <option key={status} value={status}>
                                    {STATUS_LABELS[status]}
                                </option>
                            ))}
                        </select>
                        <select
                            value={filters.source}
                            onChange={(event) =>
                                setFilters({ ...filters, source: event.target.value })
                            }
                        >
                            <option value="">All sources</option>
                            {sourceOptions.map((source) => (
                                <option key={source} value={source}>
                                    {source}
                                </option>
                            ))}
                        </select>
                        <div className="applications-date-filter" onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsAppliedDateOpen(false);
                        }}>
                            <button type="button" className="applications-date-filter-trigger" aria-haspopup="dialog" aria-expanded={isAppliedDateOpen} onClick={() => setIsAppliedDateOpen((open) => !open)}>
                                <span>Applied date: {filters.startDate || filters.endDate
                                    ? `${filters.startDate ? formatFilterDate(filters.startDate) : "Any"} – ${filters.endDate ? formatFilterDate(filters.endDate) : "Any"}`
                                    : "Any time"}</span>
                            </button>
                            {isAppliedDateOpen && (
                                <div className="applications-date-filter-popover" role="dialog" aria-label="Applied date range">
                                    <div className="applications-date-filter-heading">
                                        <strong>Applied date</strong>
                                        <span>Choose a date range</span>
                                    </div>
                                    <label>From<input type="date" value={filters.startDate} max={filters.endDate || undefined} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></label>
                                    <label>To<input type="date" value={filters.endDate} min={filters.startDate || undefined} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></label>
                                    <div className="applications-date-filter-actions">
                                        <button type="button" className="applications-date-filter-clear" onClick={() => setFilters({ ...filters, startDate: "", endDate: "" })}>Clear</button>
                                        <button type="button" className="primary" onClick={() => setIsAppliedDateOpen(false)}>Done</button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            className="interviews-reset-button"
                            onClick={() => setFilters(INITIAL_FILTERS)}
                        >
                            <AppIcon name="history" size={15} />
                            Reset
                        </button>
                    </div>

                    {sortedApplications.length > 0 ? (
                        <div className="application-list" role="list">
                            <div className="application-table-header applications-table-columns" role="row" aria-label="Application columns and sorting">
                                {renderSortButton("Role", "title")}
                                {renderSortButton("Company", "companyName")}
                                {renderSortButton("Applied date", "dateApplied")}
                                {renderSortButton("Status", "status")}
                            </div>
                            {sortedApplications.map((application) => {
                                const isSelected =
                                    selectedApplication?.id === application.id;

                                return (
                                    <button
                                        key={application.id}
                                        type="button"
                                        className={
                                            isSelected
                                                ? `application-list-item applications-table-columns status-accent ${application.status.toLowerCase()} active`
                                                : "application-list-item applications-table-columns"
                                        }
                                        aria-current={isSelected ? "true" : undefined}
                                        onClick={() => openMobileDetail(application.id)}
                                    >
                                        <span className="application-primary-cell desktop-record-cell">
                                            <strong>{application.title}</strong>
                                        </span>
                                        <span className="application-table-cell desktop-record-cell" data-label="Company">
                                            {application.companyName || "Unknown company"}
                                        </span>
                                        <span className="application-table-cell desktop-record-cell" data-label="Applied date">
                                            {formatDisplayDate(application.dateApplied)}
                                        </span>
                                        <span
                                            className={`status-pill desktop-record-cell ${application.status.toLowerCase()}`}
                                        >
                                            {getStatusLabel(application.status)}
                                        </span>
                                        <span className="mobile-record-card application-mobile-card">
                                            <span className="mobile-record-card-copy">
                                                <strong>{application.title}</strong>
                                                <span>{application.companyName || "Unknown company"}</span>
                                                <small>
                                                    Applied {formatDisplayDate(application.dateApplied).replace(/, \d{4}$/, "")}
                                                </small>
                                            </span>
                                            <span className={`status-pill ${application.status.toLowerCase()}`}>
                                                {getStatusLabel(application.status)}
                                            </span>
                                            <AppIcon name="arrow-right" size={18} className="mobile-record-chevron" />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="applications-empty application-list-empty">
                            <span className="empty-illustration">
                                <AppIcon name="applications" size={31} />
                            </span>
                            <h2>
                                {applications.length === 0
                                    ? "No applications yet"
                                    : "No applications match these filters"}
                            </h2>
                            <p>
                                {applications.length === 0
                                    ? "Add or import a role to start tracking your search."
                                    : "Clear filters or adjust the search terms to expand the list."}
                            </p>
                            <button
                                type="button"
                                className="secondary"
                                onClick={onCreateApplication}
                            >
                                <AppIcon name="plus" size={18} />
                                Add Application
                            </button>
                        </div>
                    )}
                </aside>

                <aside className={`application-detail-panel status-accent ${selectedApplication?.status.toLowerCase() ?? ""}`}>
                    {selectedApplication ? (
                        <>
                            <button type="button" className="mobile-detail-back" onClick={closeMobileDetail}>
                                <AppIcon name="arrow-left" size={20} />
                                Applications
                            </button>
                            <header className="application-detail-header">
                                <div className="application-detail-top-row">
                                    <div className="application-detail-heading">
                                        <h2>{selectedApplication.title}</h2>

                                    </div>

                                    <div
                                        className="application-detail-header-actions"
                                        aria-label="Application actions"
                                    >
                                        <button
                                            type="button"
                                            className="alternative"
                                            aria-label="Edit application"
                                            onClick={() => onStartEdit(selectedApplication)}
                                        >
                                            <AppIcon name="edit" size={25} />
                                        </button>
                                        <div className="application-detail-menu" onBlur={(event) => {
                                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsApplicationMenuOpen(false);
                                        }}>
                                            <button type="button" className="application-detail-menu-trigger" aria-label="More application actions" aria-haspopup="menu" aria-expanded={isApplicationMenuOpen} onClick={() => setIsApplicationMenuOpen((open) => !open)}>
                                                <AppIcon name="dots-vertical" size={25} />
                                            </button>
                                            {isApplicationMenuOpen && (
                                                <div className="alternative application-detail-menu-popover" role="menu">
                                                    <button type="button" role="menuitem" onClick={() => { setIsApplicationMenuOpen(false); onRemoveApplication(selectedApplication.id); }}>
                                                        <AppIcon name="trash" size={25} /> Delete application
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                                <p className="application-detail-company-location">
                                    <span className="application-detail-context-item application-detail-company">
                                        <AppIcon name="company" size={31} />
                                        {selectedApplication.companyName || "Unknown company"}
                                    </span>
                                    <span className="application-detail-context-separator" aria-hidden="true" />
                                    <span className="application-detail-context-item">
                                        <AppIcon name="location" size={31} />
                                        {selectedApplication.location || "Location not set"}
                                    </span>
                                </p>
                                <div className="application-detail-status-row">
                                    <label className="application-detail-status-control">
                                        <select
                                            aria-label="Application status"
                                            className={`status-select ${selectedApplication.status.toLowerCase()}`}
                                            value={selectedApplication.status}
                                            onChange={(event) =>
                                                onStatusChange(
                                                    selectedApplication.id,
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            {STATUSES.map((status) => (
                                                <option key={status} value={status}>
                                                    {STATUS_LABELS[status]}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <span className="application-detail-status-date">
                                        <AppIcon name="calendar" size={27} />
                                        Applied {formatDisplayDate(selectedApplication.dateApplied)}
                                    </span>
                                </div>
                                <div className="application-detail-summary" aria-label="Application overview">
                                    <span><AppIcon name="source" size={27} /> {selectedApplication.source || "No source"}</span>
                                    <span><AppIcon name="salary" size={27} /> {selectedApplication.salaryMin !== null || selectedApplication.salaryMax !== null ? `Salary: ${formatSalaryRange(selectedApplication)}` : formatSalaryRange(selectedApplication)}</span>
                                    {selectedApplication.sourceUrl && (
                                        <span><AppIcon name="external-link" size={27} className="application-detail-external-link-icon" />
                                            <a className="application-detail-posting-link" href={selectedApplication.sourceUrl} target="_blank" rel="noreferrer">
                                                Original posting
                                            </a>
                                        </span>
                                    )}
                                </div>

                            </header>

                            <div className="application-detail-layout">
                                <div className="application-detail-main">
                                    <section className="application-detail-section application-detail-card-section application-next-action-section">
                                        <div className="application-detail-section-heading">
                                            <div>
                                                <h3>Tasks</h3>
                                                <span>Next upcoming action</span>
                                            </div>
                                            <button type="button" className="alternative application-section-action" onClick={() => onCreateTask(selectedApplication.id)}>
                                                <AppIcon name="plus" size={15} /> Add task
                                            </button>
                                        </div>
                                        {nextTask ? (
                                            <div className="application-next-action-card">
                                                <button type="button" className={`application-task-checkbox ${getTaskDueState(nextTask)}`} aria-label={`Mark ${nextTask.title} complete`} onClick={() => onCompleteTask(nextTask.id)}>
                                                    <AppIcon name="check" size={15} />
                                                </button>
                                                <div>
                                                    <strong>{nextTask.title}</strong>
                                                    <p>
                                                        {nextTask.dueDate ? (
                                                            <>
                                                                <span>Due {formatTaskDueDate(nextTask.dueDate)}</span>
                                                                <span aria-hidden="true">·</span>
                                                                <span className={`application-task-due-copy ${getTaskDueState(nextTask)}`}>
                                                                    {formatTaskRemaining(nextTask.dueDate)}
                                                                </span>
                                                            </>
                                                        ) : "No due date"}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : <p className="application-detail-empty-copy">No next action set.</p>}
                                    </section>

                                    <section className="application-detail-section application-detail-card-section application-detail-interviews-section">
                                        <div className="application-detail-section-heading">
                                            <div>
                                                <div className="interview-detail-section-title">
                                                    <div className="interview-notes-card-title">
                                                        <h3>Interviews</h3>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="alternative application-section-action"
                                                onClick={() =>
                                                    onCreateInterview(selectedApplication.id)
                                                }
                                            >
                                                <AppIcon name="plus" size={15} />
                                                Add interview
                                            </button>
                                        </div>
                                        {selectedInterviews.length > 0 ? (
                                            <div className="application-interview-list">
                                                {selectedInterviews.map((interview) => (
                                                    <article
                                                        key={interview.id}
                                                        className="application-interview-item"
                                                    >

                                                        <div className="application-interview-copy">
                                                            <strong>
                                                                {getInterviewTypeLabel(
                                                                    interview.type,
                                                                )}
                                                            </strong>
                                                            <span >
                                                                <AppIcon
                                                                    name="calendar"
                                                                    size={18}
                                                                />
                                                                {formatInterviewDateTime(
                                                                    interview.scheduledAt,
                                                                )}
                                                            </span>
                                                        </div>
                                                        <span
                                                            className={`status-pill ${interview.outcome.toLowerCase()}`}
                                                        >
                                                            {getInterviewOutcomeLabel(
                                                                interview.outcome,
                                                            )}
                                                        </span>
                                                        <div className="application-interview-actions">
                                                            <button type="button" className="application-interview-icon-button" aria-label={`Edit ${getInterviewTypeLabel(interview.type)} interview`} onClick={() => onStartEditInterview(interview)}>
                                                                <AppIcon name="edit" size={18} />
                                                            </button>
                                                            <div className="application-detail-menu" onBlur={(event) => {
                                                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenInterviewMenuId(null);
                                                            }}>
                                                                <button type="button" className="application-interview-icon-button" aria-label="More interview actions" aria-haspopup="menu" aria-expanded={openInterviewMenuId === interview.id} onClick={() => setOpenInterviewMenuId((current) => current === interview.id ? null : interview.id)}>
                                                                    <AppIcon name="dots-vertical" size={18} />
                                                                </button>
                                                                {openInterviewMenuId === interview.id && (
                                                                    <div className="application-detail-menu-popover application-interview-menu-popover" role="menu">
                                                                        <button type="button" role="menuitem" onClick={() => { setOpenInterviewMenuId(null); onViewInterview(interview.id); }}>
                                                                            <AppIcon name="view" size={18} /> View interview
                                                                        </button>
                                                                        <button type="button" role="menuitem" className="danger-text" onClick={() => { setOpenInterviewMenuId(null); onRemoveInterview(interview.id); }}>
                                                                            <AppIcon name="trash" size={18} /> Delete interview
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </article>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="application-interviews-empty">
                                                <AppIcon name="contacts" size={37} />
                                                <div>No interviews yet</div>
                                            </div>
                                        )}
                                    </section>

                                    <section className="application-detail-section application-detail-card-section application-notes-card interview-notes-card">
                                        <div className="interview-detail-section-title">
                                            <div className="interview-notes-card-title">
                                                <h3>Notes</h3>
                                            </div>
                                            {!isEditingNotes && (
                                                <button type="button" className="alternative application-section-action" onClick={() => { setNotesDraft(selectedNotes); setIsEditingNotes(true); }}>
                                                    Edit notes
                                                </button>
                                            )}
                                        </div>
                                        {isEditingNotes ? (
                                            <div className="application-notes-editor">
                                                <textarea aria-label="Application notes" autoFocus value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Write a note…" />
                                                <div className="application-notes-editor-actions">
                                                    <button type="button" className="secondary" disabled={isSavingNotes} onClick={() => setIsEditingNotes(false)}>Cancel</button>
                                                    <button type="button" className="primary" disabled={isSavingNotes} onClick={async () => { setIsSavingNotes(true); try { await onUpdateNotes(selectedApplication, notesDraft); setIsEditingNotes(false); } catch { /* The page-level message reports the API error. */ } finally { setIsSavingNotes(false); } }}>
                                                        {isSavingNotes ? "Saving…" : "Save notes"}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className={selectedNotes ? "" : "is-empty"}>
                                                {!selectedNotes && <AppIcon name="document" size={37} />}
                                                {selectedNotes || "No notes added"}
                                            </p>
                                        )}
                                    </section>
                                </div>
                            </div>


                        </>
                    ) : (
                        <div className="applications-empty">
                            <span className="empty-illustration">
                                <AppIcon name="applications" size={31} />
                            </span>
                            <h2>Select an application</h2>
                            <p>
                                Choose an application from the list to review its
                                details.
                            </p>
                        </div>
                    )}
                </aside>
            </div>
        </section>
    );
}
