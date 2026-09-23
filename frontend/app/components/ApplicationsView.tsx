"use client";

import { BulkActions, BulkRow, useBulkSelection, type BulkHandler } from "./BulkActions";

import { useTaskTimeZone } from "../lib/task-timezone";

import { useMemo, useRef, useState } from "react";

import {
    getApplicationTimestamp,
    isApplicationStatus,
} from "../lib/application-analytics";
import {
    formatInterviewDateTime,
    getInterviewOutcomeLabel,
    getInterviewTypeLabel,
    sortInterviewsBySchedule,
} from "../lib/interview-utils";
import { taskCalendarDay, formatTaskDueDate, getTaskDueState, sortTasksByDueDate } from "../lib/task-utils";
import { SOURCES, STATUSES, STATUS_LABELS } from "../lib/constants";
import type {
    Application,
    ApplicationResumeSummary,
    Interview,
    ResumeVersion,
    Task,
} from "../lib/types";
import { AppIcon } from "./AppIcon";
import { CollectionTabs } from "./CollectionTabs";
import { CollectionListControls } from "./CollectionListControls";
import { ActiveFilterChips, type ActiveFilterChip } from "./ActiveFilterChips";
import { CollectionPaneCollapse, CollectionPaneDivider } from "./CollectionPaneControls";
import { useCollectionDetailPane } from "./useCollectionDetailPane";

type ApplicationsViewProps = {
    onBulkApply?: BulkHandler;
    applications: Application[];
    focusedApplicationId?: string | null;
    interviews: Interview[];
    resumes: ResumeVersion[];
    tasks: Task[];
    onCreateApplication: () => void;
    onCreateInterview: (applicationId?: string) => void;
    onCreateTask: (applicationId?: string) => void;
    onCompleteTask: (id: string) => void | Promise<void>;
    onDownloadResume: (resume: ApplicationResumeSummary) => void | Promise<void>;
    onRemoveApplication: (id: string) => void;
    onRemoveInterview: (id: string) => void | Promise<void>;
    onStartEdit: (application: Application) => void;
    onStartEditTask?: (task: Task) => void;
    onStartEditInterview: (interview: Interview) => void;
    onStatusChange: (id: string, status: string) => void;
    onUpdateNotes: (application: Application, notes: string) => Promise<void>;
    onViewInterview: (interviewId: string) => void;
};

type ApplicationsTableFilters = {
    query: string;
    status: string;
    source: string;
    resumeVersionId: string;
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
    resumeVersionId: "",
    startDate: "",
    endDate: "",
};

export const NO_RESUME_FILTER = "__no_resume__";

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

function formatTaskRemaining(value: string | null, timeZone: string) {
    if (!value) return "";
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return "";
    const days = taskCalendarDay(due, timeZone) - taskCalendarDay(new Date(), timeZone);
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    if (days === 0) return "Due today";
    return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function getSortValue(application: Application, sortKey: SortKey) {
    if (sortKey === "dateApplied") return getApplicationTimestamp(application);
    if (sortKey === "status") return getStatusLabel(application.status);

    return (application[sortKey] ?? "").toString().toLowerCase();
}

function getStatusLabel(status: string) {
    return isApplicationStatus(status) ? STATUS_LABELS[status] : status;
}

export function ApplicationsView({
    applications,
    focusedApplicationId,
    interviews,
    resumes,
    tasks,
    onCreateApplication,
    onCreateInterview,
    onCreateTask,
    onCompleteTask,
    onDownloadResume,
    onRemoveApplication,
    onRemoveInterview,
    onStartEdit,
    onStartEditTask,
    onStartEditInterview,
    onStatusChange,
    onUpdateNotes,
    onViewInterview,
    onBulkApply,
}: ApplicationsViewProps) {
    const { timeZone } = useTaskTimeZone();
    const [filters, setFilters] =
        useState<ApplicationsTableFilters>(INITIAL_FILTERS);
    const [needsAction, setNeedsAction] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("dateApplied");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
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
    const detailPane = useCollectionDetailPane("jobhazel-applications-detail-pane", focusedApplicationId);
    const sourceOptions = useMemo(() => {
        const sources = new Set<string>(SOURCES);
        applications.forEach((application) => {
            if (application.source) sources.add(application.source);
        });
        return Array.from(sources).sort((a, b) => a.localeCompare(b));
    }, [applications]);
    const resumeOptions = useMemo(() => {
        const options = new Map<
            string,
            { id: string; name: string; archivedAt: string | null }
        >();
        resumes
            .filter((resume) => resume.uploadStatus === "READY")
            .forEach((resume) => options.set(resume.id, resume));
        applications.forEach((application) => {
            if (application.resumeVersion) {
                options.set(application.resumeVersion.id, application.resumeVersion);
            }
        });
        return Array.from(options.values()).sort((left, right) =>
            left.name.localeCompare(right.name),
        );
    }, [applications, resumes]);

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
                application.resumeVersion?.name,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            if (needsAction && !tasks.some(task => task.applicationId === application.id && !task.completedAt)) return false;
            if (query && !searchableText.includes(query)) return false;
            if (filters.status && application.status !== filters.status) return false;
            if (
                filters.source &&
                application.source?.toLowerCase() !== filters.source.toLowerCase()
            )
                return false;

            const associatedResumeId =
                application.resumeVersion?.id ?? application.resumeVersionId;
            if (
                filters.resumeVersionId === NO_RESUME_FILTER &&
                associatedResumeId
            )
                return false;
            if (
                filters.resumeVersionId &&
                filters.resumeVersionId !== NO_RESUME_FILTER &&
                associatedResumeId !== filters.resumeVersionId
            )
                return false;

            const applicationTime = getApplicationTimestamp(application);
            if (startTime !== null && applicationTime < startTime) return false;
            if (endTime !== null && applicationTime > endTime) return false;

            return true;
        });
    }, [applications, filters, needsAction, tasks]);

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

    const bulk = useBulkSelection(sortedApplications, JSON.stringify({ ...filters, needsAction }));
    const selectedApplication =
        sortedApplications.find(
            (application) => application.id === detailPane.selectedId,
        ) ?? null;
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
        needsAction,
        filters.status,
        filters.source,
        filters.resumeVersionId,
        filters.startDate || filters.endDate,
    ].filter(Boolean).length;
    const activeFilterChips: ActiveFilterChip[] = [
        ...(needsAction ? [{ id: "needs-action", label: "Tasks", value: "Needs action", onRemove: () => setNeedsAction(false) }] : []),
        ...(filters.status ? [{ id: "status", label: "Status", value: getStatusLabel(filters.status), onRemove: () => setFilters((current) => ({ ...current, status: "" })) }] : []),
        ...(filters.source ? [{ id: "source", label: "Source", value: filters.source, onRemove: () => setFilters((current) => ({ ...current, source: "" })) }] : []),
        ...(filters.resumeVersionId ? [{
            id: "resume",
            label: "Resume",
            value: filters.resumeVersionId === NO_RESUME_FILTER
                ? "No resume"
                : resumeOptions.find((resume) => resume.id === filters.resumeVersionId)?.name ?? "Selected resume",
            onRemove: () => setFilters((current) => ({ ...current, resumeVersionId: "" })),
        }] : []),
        ...(filters.startDate || filters.endDate ? [{
            id: "applied-date",
            label: "Applied",
            value: `${filters.startDate ? formatFilterDate(filters.startDate) : "Any"} – ${filters.endDate ? formatFilterDate(filters.endDate) : "Any"}`,
            onRemove: () => setFilters((current) => ({ ...current, startDate: "", endDate: "" })),
        }] : []),
    ];

    function openMobileDetail(applicationId: string) {
        listScrollPosition.current = window.scrollY;
        detailPane.select(applicationId);
        setIsEditingNotes(false);
        const shouldUseMobileDetail = window.matchMedia?.("(max-width: 900px)").matches ?? false;
        setIsMobileDetailOpen(shouldUseMobileDetail);
        if (shouldUseMobileDetail) requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }

    function closeMobileDetail() {
        setIsMobileDetailOpen(false);
        detailPane.collapse();
        requestAnimationFrame(() =>
            window.scrollTo({ top: listScrollPosition.current, behavior: "auto" }),
        );
    }
    return (
        <section className={isMobileDetailOpen ? "applications-page mobile-page-detail-open" : "applications-page"}>
            <CollectionTabs label="applications views" value={needsAction ? "needs-action" : filters.status} options={[{ value: "", label: "All", count: applications.length }, ...["APPLIED", "INTERVIEWING"].map(value => ({ value, label: getStatusLabel(value), count: applications.filter(item => item.status === value).length })), { value: "needs-action", label: "Needs action", count: applications.filter(item => tasks.some(task => task.applicationId === item.id && !task.completedAt)).length }]} onChange={value => { setNeedsAction(value === "needs-action"); setFilters(current => ({ ...current, status: value === "needs-action" ? "" : value })); }} />
            <div
                ref={detailPane.containerRef}
                style={detailPane.splitStyle}
                className={`applications-split-panel${selectedApplication && detailPane.isOpen ? " detail-pane-open" : ""}${isMobileDetailOpen ? " mobile-detail-open" : ""}${detailPane.isDragging ? " is-resizing" : ""}`}
            >
                <aside className="application-list-panel">

                    <CollectionListControls
                        activeFilters={<ActiveFilterChips chips={activeFilterChips} />}
                        noun="applications"
                        search={<label className="applications-search-field">
                            <AppIcon name="search" size={18} />
                            <input
                                aria-label="Search applications"
                                value={filters.query}
                                onChange={(event) =>
                                    setFilters({ ...filters, query: event.target.value })
                                }
                                placeholder="Search applications, companies, or roles…"
                            />
                        </label>}
                        filters={<><select
                            aria-label="Filter applications by status"
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
                            aria-label="Filter applications by source"
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
                        <select
                            aria-label="Filter by resume"
                            value={filters.resumeVersionId}
                            onChange={(event) =>
                                setFilters({
                                    ...filters,
                                    resumeVersionId: event.target.value,
                                })
                            }
                        >
                            <option value="">All resumes</option>
                            <option value={NO_RESUME_FILTER}>No resume</option>
                            {resumeOptions.map((resume) => (
                                <option key={resume.id} value={resume.id}>
                                    {resume.name}{resume.archivedAt ? " (Archived)" : ""}
                                </option>
                            ))}
                        </select>
                        <div className="applications-date-filter" onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsAppliedDateOpen(false);
                        }}>
                            <button type="button" className="applications-date-filter-trigger" aria-haspopup="dialog" aria-expanded={isAppliedDateOpen} onClick={() => setIsAppliedDateOpen((open) => !open)}>
                                <span>Date: {filters.startDate || filters.endDate
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
                        </div></>}
                        filtersOpen={isFiltersOpen}
                        onToggleFilters={() => { setIsFiltersOpen(open => !open); setIsAppliedDateOpen(false); }}
                        activeFilterCount={activeFilterCount}
                        hasActiveFilters={Boolean(filters.query.trim() || activeFilterCount)}
                        onReset={() => { setFilters(INITIAL_FILTERS); setNeedsAction(false); setIsAppliedDateOpen(false); }}
                        sortValue={`${sortKey}:${sortDirection}`}
                        sortOptions={[{ value: "dateApplied:desc", label: "Applied date: newest first" }, { value: "dateApplied:asc", label: "Applied date: oldest first" }, { value: "title:asc", label: "Role: A to Z" }, { value: "title:desc", label: "Role: Z to A" }, { value: "companyName:asc", label: "Company: A to Z" }, { value: "companyName:desc", label: "Company: Z to A" }, { value: "status:asc", label: "Status: A to Z" }, { value: "status:desc", label: "Status: Z to A" }]}
                        onSortChange={value => { const [key, direction] = value.split(":"); setSortKey(key as SortKey); setSortDirection(direction as SortDirection); }}
                    />

                    <BulkActions selection={bulk} count={sortedApplications.length} noun="applications" onApply={onBulkApply} fields={[{ key: "status", label: "Status", options: STATUSES.map(status => ({ value: status, label: STATUS_LABELS[status] })) }]} deleteNote="Linked interviews and application history are also deleted; linked tasks and contacts are unlinked." />

                    {sortedApplications.length > 0 ? (
                        <div className="application-list" role="list">
                            {sortedApplications.map((application) => {
                                const isSelected =
                                    selectedApplication?.id === application.id;

                                return (
                                    <BulkRow key={application.id} selection={bulk} id={application.id} label={application.title}><button
                                        type="button"
                                        className={
                                            isSelected
                                                ? `application-list-item applications-table-columns status-accent ${application.status.toLowerCase()} active`
                                                : "application-list-item applications-table-columns"
                                        }
                                        aria-current={isSelected ? "true" : undefined}
                                        onClick={() => openMobileDetail(application.id)}
                                    >
                                        <span className="collection-record-copy">
                                            <strong>{application.title}</strong>
                                            <span>{application.companyName || "Unknown company"}{application.location ? " · " + application.location : ""}</span>
                                            <small>{(() => {
                                                const next = sortTasksByDueDate(tasks.filter(task => task.applicationId === application.id && !task.completedAt))[0];
                                                return next ? next.title + (next.dueDate ? " · " + formatTaskDueDate(next.dueDate, timeZone) : "") : "Applied " + formatDisplayDate(application.dateApplied);
                                            })()}</small>
                                        </span>
                                        <span className={"status-pill " + application.status.toLowerCase()}>{getStatusLabel(application.status)}</span>
                                        <AppIcon name="arrow-right" size={18} className="collection-record-chevron" />
                                    </button></BulkRow>
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

                {selectedApplication && detailPane.isOpen && <CollectionPaneDivider onResizeStart={detailPane.beginResize} onResizeBy={detailPane.resizeWithKeyboard} />}
                <aside className={`application-detail-panel application-reference-detail status-accent ${selectedApplication?.status.toLowerCase() ?? ""}`}>
                    {selectedApplication ? (
                        <>
                            <button type="button" className="mobile-detail-back" onClick={closeMobileDetail}>
                                <AppIcon name="arrow-left" size={20} />
                                Applications
                            </button>
                            <CollectionPaneCollapse label="application" onCollapse={() => { detailPane.collapse(); setIsMobileDetailOpen(false); }} />
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
                                                <div className="application-detail-menu-popover" role="menu">
                                                    <button type="button" role="menuitem" className="danger-text" onClick={() => { setIsApplicationMenuOpen(false); onRemoveApplication(selectedApplication.id); }}>
                                                        <AppIcon name="trash" size={25} /> Delete application
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                                <p className="application-detail-company-location">
                                    <span className="application-detail-context-item application-detail-company">
                                        {selectedApplication.companyName || "Unknown company"}
                                    </span>
                                    <span className="application-detail-context-separator" aria-hidden="true">·</span>
                                    <span className="application-detail-context-item">
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
                                        {selectedApplication.dateApplied
                                            ? `Applied ${formatDisplayDate(selectedApplication.dateApplied)}`
                                            : formatDisplayDate(selectedApplication.dateApplied)}
                                    </span>
                                </div>
                                {selectedApplication.sourceUrl && <div className="application-detail-summary">
                                    <a className="application-detail-posting-link" href={selectedApplication.sourceUrl} target="_blank" rel="noreferrer"><AppIcon name="external-link" size={16} />Original posting</a>
                                </div>}

                            </header>

                            <div className="application-detail-layout">
                                <div className="application-detail-main">
                                    <section className={`application-detail-section application-detail-card-section application-resume-detail-section${selectedApplication.resumeVersion ? "" : " resume-not-recorded"}`}>
                                        {selectedApplication.resumeVersion ? (
                                            <div className="application-resume-detail-card">
                                                <span className="application-resume-detail-icon" aria-hidden="true">
                                                    <AppIcon name="document" size={21} />
                                                </span>
                                                <span className="application-resume-detail-copy">
                                                    <strong>{selectedApplication.resumeVersion.name}</strong>
                                                    <small>
                                                        {selectedApplication.resumeVersion.originalFilename}
                                                        {selectedApplication.resumeVersion.targetRole
                                                            ? ` · ${selectedApplication.resumeVersion.targetRole}`
                                                            : ""}
                                                    </small>
                                                </span>
                                                {selectedApplication.resumeVersion.archivedAt && (
                                                    <span className="application-resume-archived-badge">Archived</span>
                                                )}
                                                <button
                                                    type="button"
                                                    className="alternative application-resume-download"
                                                    onClick={() =>
                                                        onDownloadResume(
                                                            selectedApplication.resumeVersion!,
                                                        )
                                                    }
                                                >
                                                    Download PDF
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="application-resume-detail-empty">
                                                <AppIcon name="warning" size={22} />
                                                <span>
                                                    <strong>No resume recorded</strong>
                                                </span>
                                                <button type="button" className="alternative application-section-action" onClick={() => onStartEdit(selectedApplication)}>Attach resume</button>
                                            </div>
                                        )}
                                    </section>
                                    <section className="application-detail-section application-detail-card-section application-next-action-section">
                                        <div className="next-action-heading">
                                            <h3>{nextTask ? "Next action" : "No next action"}</h3>
                                            {nextTask ? <span className={"next-action-due-badge " + getTaskDueState(nextTask, timeZone)}>{formatTaskRemaining(nextTask.dueDate, timeZone) || "No due date"}</span> :
                                                <button type="button" className="alternative application-section-action" onClick={() => onCreateTask(selectedApplication.id)}><AppIcon name="plus" size={15} />Add task</button>}
                                        </div>
                                        {nextTask ? <>
                                            <div className="next-action-content">
                                                <strong>{nextTask.title}</strong>
                                                <p><AppIcon name="calendar" size={18} />{nextTask.dueDate ? formatTaskDueDate(nextTask.dueDate, timeZone) : "No due date"}</p>
                                            </div>
                                            <div className="collection-next-actions">
                                                <button type="button" className="primary" onClick={() => onCompleteTask(nextTask.id)}>Mark done</button>
                                                {onStartEditTask && <button type="button" className="alternative" onClick={() => onStartEditTask(nextTask)}>Reschedule</button>}
                                                <div className="next-action-menu application-detail-menu" onBlur={event => {
                                                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTaskMenuId(null);
                                                }} onKeyDown={event => {
                                                    if (event.key === "Escape") { setTaskMenuId(null); event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus(); }
                                                }}>
                                                    <button type="button" className="next-action-more" aria-label="More task actions" aria-haspopup="menu" aria-expanded={taskMenuId === nextTask.id} onClick={() => setTaskMenuId(current => current === nextTask.id ? null : nextTask.id)}><AppIcon name="dots-vertical" size={20} /></button>
                                                    {taskMenuId === nextTask.id && <div className="application-detail-menu-popover" role="menu">
                                                        {onStartEditTask && <button type="button" role="menuitem" onClick={() => { setTaskMenuId(null); onStartEditTask(nextTask); }}><AppIcon name="edit" size={16} />Edit task</button>}
                                                        <button type="button" role="menuitem" onClick={() => { setTaskMenuId(null); onCreateTask(selectedApplication.id); }}><AppIcon name="plus" size={16} />Add task</button>
                                                    </div>}
                                                </div>
                                            </div>
                                        </> : null}
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

                                                            <div className="application-detail-menu" onBlur={(event) => {
                                                                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenInterviewMenuId(null);
                                                            }}>
                                                                <button type="button" className="application-interview-icon-button" aria-label="More interview actions" aria-haspopup="menu" aria-expanded={openInterviewMenuId === interview.id} onClick={() => setOpenInterviewMenuId((current) => current === interview.id ? null : interview.id)}>
                                                                    <AppIcon name="dots-vertical" size={18} />
                                                                </button>
                                                                {openInterviewMenuId === interview.id && (
                                                                    <div className="application-detail-menu-popover application-interview-menu-popover" role="menu">
                                                                        <button type="button" role="menuitem" onClick={() => { setOpenInterviewMenuId(null); onStartEditInterview(interview); }}><AppIcon name="edit" size={18} />Edit interview</button>
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
                                                    {!selectedNotes && <AppIcon name="plus" size={18} />}{selectedNotes ? "Edit notes" : "Add note"}
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
                                                {selectedNotes || "No notes yet"}
                                            </p>
                                        )}
                                    </section>
                                    <section className="application-detail-section application-facts-section">
                                        <h3>Application details</h3>
                                        <dl className="collection-facts">
                                            <div><dt>Applied on</dt><dd>{formatDisplayDate(selectedApplication.dateApplied)}</dd></div>
                                            <div><dt>Source</dt><dd>{selectedApplication.source || "Not specified"}</dd></div>
                                            <div><dt>Location</dt><dd>{selectedApplication.location || "Not specified"}</dd></div>
                                            <div><dt>Salary range</dt><dd>{formatSalaryRange(selectedApplication)}</dd></div>
                                        </dl>
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
