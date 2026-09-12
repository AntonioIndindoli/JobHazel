"use client";

import {
    type KeyboardEvent as ReactKeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    DASHBOARD_STATUSES,
    DASHBOARD_TIMEFRAME_OPTIONS,
    SOURCES,
    STATUSES,
    STATUS_LABELS,
} from "../../lib/constants";
import {
    getInterviewTimestamp,
    getInterviewTypeLabel,
} from "../../lib/interview-utils";
import type {
    ActivityLog,
    Application,
    ApplicationFilters,
    DashboardStatus,
    Interview,
} from "../../lib/types";
import { AppIcon } from "../AppIcon";
import { ActiveFilterChips, type ActiveFilterChip } from "../ActiveFilterChips";
import { InfoTooltip } from "./InfoTooltip";

type ApplicationTrackerProps = {
    applications: Application[];
    filters: ApplicationFilters;
    groupedApplications: Record<DashboardStatus, Application[]>;
    mobileGroupedApplications: Record<DashboardStatus, Application[]>;
    historyByApp: Record<string, ActivityLog[]>;
    interviews: Interview[];
    openTimelineId: string | null;
    trackerApplications: Application[];
    onFiltersChange: (filters: ApplicationFilters) => void;
    onRemoveApplication: (id: string) => void;
    onRemoveHistoryEvent: (
        applicationId: string,
        activityLogId: string,
    ) => void | Promise<void>;
    onStartEdit: (application: Application) => void;
    onToggleTimeline: (id: string) => void | Promise<void>;
    onTransitionStatus: (id: string, nextStatus: string) => void | Promise<void>;
    onViewApplication: (id: string) => void;
};

function formatAppliedDate(dateApplied: string | null) {
    if (!dateApplied) return "No applied date";

    const date = new Date(dateApplied);
    if (Number.isNaN(date.getTime())) return "No applied date";

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function getDisplayInterview(interviews: Interview[]) {
    const now = Date.now();
    const validInterviews = interviews.filter(
        (interview) => getInterviewTimestamp(interview) > 0,
    );
    const sourceInterviews = validInterviews.length ? validInterviews : interviews;
    const upcomingInterview = sourceInterviews
        .filter(
            (interview) =>
                interview.outcome === "SCHEDULED" &&
                getInterviewTimestamp(interview) >= now,
        )
        .sort(
            (left, right) =>
                getInterviewTimestamp(left) - getInterviewTimestamp(right),
        )[0];

    if (upcomingInterview) return upcomingInterview;

    return [...sourceInterviews].sort(
        (left, right) =>
            getInterviewTimestamp(right) - getInterviewTimestamp(left),
    )[0];
}

export function ApplicationTracker({
    applications,
    filters,
    groupedApplications,
    mobileGroupedApplications,
    historyByApp,
    interviews,
    openTimelineId,
    trackerApplications,
    onFiltersChange,
    onRemoveApplication,
    onRemoveHistoryEvent,
    onStartEdit,
    onToggleTimeline,
    onTransitionStatus,
    onViewApplication,
}: ApplicationTrackerProps) {
    const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(false);
    const [mobileActiveStatus, setMobileActiveStatus] =
        useState<DashboardStatus>(
            () =>
                DASHBOARD_STATUSES.find(
                    (status) => groupedApplications[status].length > 0,
                ) ?? "APPLIED",
        );
    const [mobileStageOverflow, setMobileStageOverflow] = useState({
        start: false,
        end: false,
    });
    const [hasSelectedMobileStage, setHasSelectedMobileStage] = useState(false);
    const mobileFiltersToggleRef = useRef<HTMLButtonElement>(null);
    const mobileFiltersCloseRef = useRef<HTMLButtonElement>(null);
    const mobileStageTabsRef = useRef<HTMLDivElement>(null);
    const mobileStageTabRefs = useRef<
        Partial<Record<DashboardStatus, HTMLButtonElement | null>>
    >({});
    const activeFilterCount = [
        filters.status,
        filters.source,
        filters.company,
        filters.timeframe,
    ].filter(Boolean).length;
    const hasActiveFilters = Object.values(filters).some(Boolean);
    const activeFilterChips: ActiveFilterChip[] = [
        ...(filters.status ? [{ id: "status", label: "Status", value: STATUS_LABELS[filters.status as keyof typeof STATUS_LABELS] ?? filters.status, onRemove: () => onFiltersChange({ ...filters, status: "" }) }] : []),
        ...(filters.source ? [{ id: "source", label: "Source", value: filters.source, onRemove: () => onFiltersChange({ ...filters, source: "" }) }] : []),
        ...(filters.timeframe ? [{ id: "timeframe", label: "Applied", value: DASHBOARD_TIMEFRAME_OPTIONS.find((option) => option.value === filters.timeframe)?.label ?? filters.timeframe, onRemove: () => onFiltersChange({ ...filters, timeframe: "" }) }] : []),
        ...(filters.company ? [{ id: "company", label: "Company or role", value: filters.company, onRemove: () => onFiltersChange({ ...filters, company: "" }) }] : []),
    ];
    const filteredMobileStatus = DASHBOARD_STATUSES.find(
        (status) => status === filters.status,
    );
    const firstPopulatedMobileStatus = DASHBOARD_STATUSES.find(
        (status) => mobileGroupedApplications[status].length > 0,
    );
    const resolvedMobileActiveStatus =
        filteredMobileStatus ??
        (!hasSelectedMobileStage &&
        mobileGroupedApplications[mobileActiveStatus].length === 0
            ? (firstPopulatedMobileStatus ?? mobileActiveStatus)
            : mobileActiveStatus);

    const updateMobileStageOverflow = useCallback(() => {
        const tabList = mobileStageTabsRef.current;
        if (!tabList) return;

        const maxScrollLeft = Math.max(
            0,
            tabList.scrollWidth - tabList.clientWidth,
        );
        const nextOverflow = {
            start: tabList.scrollLeft > 2,
            end: tabList.scrollLeft < maxScrollLeft - 2,
        };

        setMobileStageOverflow((current) =>
            current.start === nextOverflow.start &&
            current.end === nextOverflow.end
                ? current
                : nextOverflow,
        );
    }, []);

    const selectMobileStage = useCallback(
        (status: DashboardStatus) => {
            setHasSelectedMobileStage(true);
            setMobileActiveStatus(status);

            if (filters.status !== status) {
                onFiltersChange({ ...filters, status });
            }
        },
        [filters, onFiltersChange],
    );

    function handleMobileStageKeyDown(
        event: ReactKeyboardEvent<HTMLButtonElement>,
        status: DashboardStatus,
    ) {
        const currentIndex = DASHBOARD_STATUSES.indexOf(status);
        let nextIndex: number | null = null;

        if (event.key === "ArrowRight") {
            nextIndex = (currentIndex + 1) % DASHBOARD_STATUSES.length;
        } else if (event.key === "ArrowLeft") {
            nextIndex =
                (currentIndex - 1 + DASHBOARD_STATUSES.length) %
                DASHBOARD_STATUSES.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = DASHBOARD_STATUSES.length - 1;
        }

        if (nextIndex === null) return;

        event.preventDefault();
        const nextStatus = DASHBOARD_STATUSES[nextIndex];
        selectMobileStage(nextStatus);
        mobileStageTabRefs.current[nextStatus]?.focus();
    }

    useEffect(() => {
        if (!isMobileFiltersOpen) return;

        const previousOverflow = document.body.style.overflow;
        const filterToggle = mobileFiltersToggleRef.current;
        document.body.style.overflow = "hidden";
        mobileFiltersCloseRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") setIsMobileFiltersOpen(false);
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
            filterToggle?.focus();
        };
    }, [isMobileFiltersOpen]);

    useEffect(() => {
        const mobileQuery = window.matchMedia("(max-width: 900px)");

        function syncMobileLayout() {
            setIsMobileLayout(mobileQuery.matches);
            if (!mobileQuery.matches) setIsMobileFiltersOpen(false);
        }

        syncMobileLayout();
        mobileQuery.addEventListener("change", syncMobileLayout);
        return () => mobileQuery.removeEventListener("change", syncMobileLayout);
    }, []);

    useEffect(() => {
        const tabList = mobileStageTabsRef.current;
        if (!tabList) return;

        tabList.addEventListener("scroll", updateMobileStageOverflow, {
            passive: true,
        });
        window.addEventListener("resize", updateMobileStageOverflow);
        updateMobileStageOverflow();

        return () => {
            tabList.removeEventListener("scroll", updateMobileStageOverflow);
            window.removeEventListener("resize", updateMobileStageOverflow);
        };
    }, [updateMobileStageOverflow]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(updateMobileStageOverflow);
        return () => window.cancelAnimationFrame(frame);
    }, [mobileGroupedApplications, updateMobileStageOverflow]);

    useEffect(() => {
        if (!isMobileLayout) return;

        const activeTab = mobileStageTabRefs.current[resolvedMobileActiveStatus];
        if (!activeTab) return;

        const frame = window.requestAnimationFrame(() => {
            activeTab.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                    .matches
                    ? "auto"
                    : "smooth",
                block: "nearest",
                inline: "center",
            });
            updateMobileStageOverflow();
        });

        return () => window.cancelAnimationFrame(frame);
    }, [
        isMobileLayout,
        resolvedMobileActiveStatus,
        updateMobileStageOverflow,
    ]);

    const interviewByApplicationId = useMemo(() => {
        const groupedInterviews = new Map<string, Interview[]>();

        interviews.forEach((interview) => {
            const existing = groupedInterviews.get(interview.applicationId) ?? [];
            groupedInterviews.set(interview.applicationId, [...existing, interview]);
        });

        const selectedInterviews = new Map<string, Interview>();
        groupedInterviews.forEach((applicationInterviews, applicationId) => {
            const interview = getDisplayInterview(applicationInterviews);
            if (interview) selectedInterviews.set(applicationId, interview);
        });

        return selectedInterviews;
    }, [interviews]);

    return (
        <section className="panel tracker-panel">
            <div className="panel-title tracker-heading-row">
                <div>
                    <h2>
                        Application Tracker
                        <InfoTooltip
                            label="Application tracker information"
                            tooltip="Filter applications and move cards between stages to keep your pipeline current."
                        />
                    </h2>
                </div>
            </div>
            <button
                ref={mobileFiltersToggleRef}
                type="button"
                className="dashboard-filter-toggle"
                aria-controls="dashboard-application-filters"
                aria-expanded={isMobileFiltersOpen}
                onClick={() => setIsMobileFiltersOpen(true)}
            >
                <AppIcon name="filter" size={17} />
                Filters
                {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
            {isMobileFiltersOpen && (
                <button
                    type="button"
                    className="dashboard-filter-backdrop"
                    aria-label="Close application filters"
                    onClick={() => setIsMobileFiltersOpen(false)}
                />
            )}
            <div
                id="dashboard-application-filters"
                className={
                    isMobileFiltersOpen
                        ? "filter-row dashboard-filters-open"
                        : "filter-row"
                }
                aria-label="Application filters"
            >
                <div className="dashboard-filter-sheet-header">
                    <strong>Filter applications</strong>
                    <button
                        ref={mobileFiltersCloseRef}
                        type="button"
                        aria-label="Close application filters"
                        onClick={() => setIsMobileFiltersOpen(false)}
                    >
                        <AppIcon name="x" size={20} />
                    </button>
                </div>
                <label className="tracker-search-field">
                    <AppIcon name="search" size={17} />
                    <input
                        aria-label="Search applications"
                        placeholder="Search applications..."
                        value={filters.query}
                        onChange={(event) =>
                            onFiltersChange({ ...filters, query: event.target.value })
                        }
                    />
                </label>
                <select
                    className="tracker-status-filter"
                    aria-label="Filter by status"
                    value={filters.status}
                    onChange={(event) =>
                        onFiltersChange({ ...filters, status: event.target.value })
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
                        onFiltersChange({ ...filters, source: event.target.value })
                    }
                >
                    <option value="">All sources</option>
                    {SOURCES.map((source) => (
                        <option key={source}>{source}</option>
                    ))}
                </select>
                <select
                    aria-label="Filter by timeframe"
                    value={filters.timeframe}
                    onChange={(event) =>
                        onFiltersChange({
                            ...filters,
                            timeframe: event.target
                                .value as ApplicationFilters["timeframe"],
                        })
                    }
                >
                    {DASHBOARD_TIMEFRAME_OPTIONS.map((option) => (
                        <option key={option.value || "all-time"} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <input
                    aria-label="Filter by company or job title"
                    placeholder="Company or job title"
                    value={filters.company}
                    onChange={(event) =>
                        onFiltersChange({ ...filters, company: event.target.value })
                    }
                />
                <button
                    type="button"
                    className="tracker-clear-filters"
                    disabled={!hasActiveFilters}
                    onClick={() =>
                        onFiltersChange({
                            query: "",
                            status: "",
                            source: "",
                            company: "",
                            timeframe: "",
                        })
                    }
                >
                    Clear filters
                </button>
                <button
                    type="button"
                    className="dashboard-filter-done"
                    onClick={() => setIsMobileFiltersOpen(false)}
                >
                    Show results
                </button>
            </div>
            <ActiveFilterChips chips={activeFilterChips} className="dashboard-active-filter-chips" />
            <div
                className={`mobile-stage-tabs-shell${
                    mobileStageOverflow.start ? " has-overflow-start" : ""
                }${mobileStageOverflow.end ? " has-overflow-end" : ""}`}
            >
                <div
                    ref={mobileStageTabsRef}
                    className="mobile-stage-tabs"
                    role="tablist"
                    aria-label="Application stages"
                >
                    {DASHBOARD_STATUSES.map((status) => (
                        <button
                            key={status}
                            ref={(button) => {
                                mobileStageTabRefs.current[status] = button;
                            }}
                            type="button"
                            id={`mobile-stage-tab-${status.toLowerCase()}`}
                            role="tab"
                            aria-controls={`application-stage-${status.toLowerCase()}`}
                            aria-label={`${STATUS_LABELS[status]}, ${
                                mobileGroupedApplications[status].length
                            } ${
                                mobileGroupedApplications[status].length === 1
                                    ? "application"
                                    : "applications"
                            }`}
                            aria-selected={resolvedMobileActiveStatus === status}
                            tabIndex={resolvedMobileActiveStatus === status ? 0 : -1}
                            onClick={() => selectMobileStage(status)}
                            onKeyDown={(event) =>
                                handleMobileStageKeyDown(event, status)
                            }
                        >
                            {STATUS_LABELS[status]}
                            <span aria-hidden="true">
                                {mobileGroupedApplications[status].length}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="kanban">
                {DASHBOARD_STATUSES.map((status) => (
                    <section
                        key={status}
                        id={`application-stage-${status.toLowerCase()}`}
                        role={isMobileLayout ? "tabpanel" : undefined}
                        aria-labelledby={
                            isMobileLayout
                                ? `mobile-stage-tab-${status.toLowerCase()}`
                                : undefined
                        }
                        hidden={
                            isMobileLayout && resolvedMobileActiveStatus !== status
                        }
                        className={`lane ${status.toLowerCase()}${
                            resolvedMobileActiveStatus === status
                                ? " mobile-active"
                                : ""
                        }`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            const id = event.dataTransfer.getData("text/plain");
                            if (id) onTransitionStatus(id, status);
                        }}
                    >
                        <h3 className="lane-header">
                            <span className="lane-title">
                                <span className="lane-dot" aria-hidden="true" />
                                {STATUS_LABELS[status]}
                            </span>
                            <strong>{groupedApplications[status].length}</strong>
                        </h3>
                        <div className={`dropzone ${status.toLowerCase()}`}>
                            {groupedApplications[status].length === 0 &&
                                trackerApplications.length > 0 && (
                                    <div className="lane-empty">
                                        <span aria-hidden="true">
                                            <AppIcon
                                                name="x"
                                                size={23}
                                            />
                                        </span>
                                        <p>No applications yet</p>
                                    </div>
                                )}
                            {groupedApplications[status].map((application) => (
                                (() => {
                                    const interview = interviewByApplicationId.get(
                                        application.id,
                                    );
                                    const history = historyByApp[application.id] ?? [];

                                    return (
                                        <article
                                            key={application.id}
                                            className="job-card"
                                            draggable
                                            onDragStart={(event) =>
                                                event.dataTransfer.setData(
                                                    "text/plain",
                                                    application.id,
                                                )
                                            }
                                        >
                                            <div className="job-card-header">
                                                <div className="job-card-title-group">
                                                    <b>{application.title}</b>
                                                    <span className="job-card-company">
                                                        {application.companyName ?? "Unknown"}
                                                    </span>
                                                </div>
                                                <div
                                                    className="job-card-menu"
                                                    onBlur={(event) => {
                                                        if (
                                                            !event.currentTarget.contains(
                                                                event.relatedTarget as Node | null,
                                                            )
                                                        ) {
                                                            setOpenCardMenuId(null);
                                                        }
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="job-card-menu-trigger"
                                                        aria-label={`Open actions for ${application.title}`}
                                                        aria-haspopup="menu"
                                                        aria-expanded={
                                                            openCardMenuId === application.id
                                                        }
                                                        onClick={() =>
                                                            setOpenCardMenuId((current) =>
                                                                current === application.id
                                                                    ? null
                                                                    : application.id,
                                                            )
                                                        }
                                                    >
                                                        <AppIcon
                                                            name="dots-vertical"
                                                            size={17}
                                                        />
                                                    </button>
                                                    {openCardMenuId === application.id && (
                                                        <div
                                                            className="job-card-menu-popover"
                                                            role="menu"
                                                        >
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() => {
                                                                    setOpenCardMenuId(null);
                                                                    onViewApplication(
                                                                        application.id,
                                                                    );
                                                                }}
                                                            >
                                                                <AppIcon
                                                                    name="view"
                                                                    size={14}
                                                                />
                                                                View application
                                                            </button>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() => {
                                                                    setOpenCardMenuId(null);
                                                                    onToggleTimeline(
                                                                        application.id,
                                                                    );
                                                                }}
                                                            >
                                                                <AppIcon
                                                                    name="history"
                                                                    size={14}
                                                                />
                                                                View history
                                                            </button>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() => {
                                                                    setOpenCardMenuId(null);
                                                                    onStartEdit(application);
                                                                }}
                                                            >
                                                                <AppIcon
                                                                    name="edit"
                                                                    size={14}
                                                                />
                                                                Edit
                                                            </button>
                                                            <button
                                                                type="button"
                                                                role="menuitem"
                                                                onClick={() => {
                                                                    setOpenCardMenuId(null);
                                                                    onRemoveApplication(
                                                                        application.id,
                                                                    );
                                                                }}
                                                            >
                                                                <AppIcon
                                                                    name="trash"
                                                                    size={14}
                                                                />
                                                                Delete
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div
                                                className="job-card-footer"
                                            >
                                                <small className="applied-date">
                                                    <AppIcon name="calendar" size={12} />
                                                    {formatAppliedDate(
                                                        application.dateApplied,
                                                    )}
                                                </small>
                                                <label className="mobile-status-control">
                                                    <span>Status</span>
                                                    <select
                                                        aria-label={`Change status for ${application.title}`}
                                                        value={application.status}
                                                        onChange={(event) =>
                                                            onTransitionStatus(
                                                                application.id,
                                                                event.target.value,
                                                            )
                                                        }
                                                    >
                                                        {DASHBOARD_STATUSES.map(
                                                            (nextStatus) => (
                                                                <option
                                                                    key={nextStatus}
                                                                    value={nextStatus}
                                                                >
                                                                    {
                                                                        STATUS_LABELS[
                                                                            nextStatus
                                                                        ]
                                                                    }
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </label>
                                            </div>
                                            {openTimelineId === application.id && (
                                                <ul className="job-card-history">
                                                    {history.length ? (
                                                        history.map((entry) => (
                                                            <li
                                                                key={entry.id}
                                                                className="job-card-history-event"
                                                            >
                                                                <span>{entry.message}</span>
                                                                <button
                                                                    type="button"
                                                                    className="job-card-history-remove"
                                                                    aria-label="Remove history event"
                                                                    onClick={() =>
                                                                        onRemoveHistoryEvent(
                                                                            application.id,
                                                                            entry.id,
                                                                        )
                                                                    }
                                                                >
                                                                    <AppIcon name="x" size={12} />
                                                                </button>
                                                            </li>
                                                        ))
                                                    ) : (
                                                        <li className="job-card-history-empty">
                                                            No history yet.
                                                        </li>
                                                    )}
                                                </ul>
                                            )}
                                        </article>
                                    );
                                })()
                            ))}
                        </div>
                    </section>
                ))}
            </div>
            {trackerApplications.length === 0 && (
                <div className="empty-tracker">
                    <span className="empty-tracker-icon" aria-hidden="true">
                        <AppIcon name="check" size={25} />
                    </span>
                    <div className="empty-tracker-copy">
                        <h3>
                            {applications.length === 0
                                ? "Your pipeline is empty"
                                : "No applications match these filters"}
                        </h3>
                        <p>
                            {applications.length === 0
                                ? "Add your first application to start tracking your job search."
                                : "Adjust the Application Tracker filters to see more applications."}
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
