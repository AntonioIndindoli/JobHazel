"use client";

import { BulkActions, BulkRow, useBulkSelection, type BulkHandler } from "./BulkActions";

import { useMemo, useRef, useState } from "react";

import {
    getInterviewOutcomeLabel,
    getInterviewTimestamp,
    getInterviewTypeLabel,
    formatInterviewDuration,
} from "../lib/interview-utils";
import { INTERVIEW_OUTCOMES, INTERVIEW_TYPES } from "../lib/constants";
import type { Application, Interview } from "../lib/types";
import { AddInterviewButton } from "./AddInterviewButton";
import { AppIcon } from "./AppIcon";
import { CollectionTabs } from "./CollectionTabs";
import { CollectionListControls } from "./CollectionListControls";
import { ActiveFilterChips, type ActiveFilterChip } from "./ActiveFilterChips";
import { CollectionPaneCollapse, CollectionPaneDivider } from "./CollectionPaneControls";
import { useCollectionDetailPane } from "./useCollectionDetailPane";

type InterviewsViewProps = {
    onBulkApply?: BulkHandler;
    applications: Application[];
    focusedInterviewId?: string | null;
    interviews: Interview[];
    onCreateInterview: () => void;
    onRemoveInterview: (id: string) => void;
    onOutcomeChange: (id: string, outcome: string) => void | Promise<void>;
    onUpdateNotes: (id: string, notes: string) => Promise<void>;
    onStartEdit: (interview: Interview) => void;
    onViewApplication: (id: string) => void;
};

type InterviewFilters = {
    query: string;
    type: string;
    outcome: string;
};

type SortKey = "scheduledAt" | "applicationTitle" | "companyName" | "type" | "outcome";
type SortDirection = "asc" | "desc";

const INITIAL_FILTERS: InterviewFilters = {
    query: "",
    type: "",
    outcome: "",
};

function getSearchableInterviewText(interview: Interview) {
    return [
        interview.applicationTitle,
        interview.companyName,
        interview.interviewerName,
        interview.location,
        interview.meetingUrl,
        interview.notes,
        getInterviewTypeLabel(interview.type),
        getInterviewOutcomeLabel(interview.outcome),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function getValidInterviewDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatInterviewDateLabel(value: string, includeYear = false) {
    const date = getValidInterviewDate(value);
    if (!date) return "Not set";

    return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        ...(includeYear ? { year: "numeric" } : {}),
    }).format(date);
}

function formatInterviewTimeLabel(value: string) {
    const date = getValidInterviewDate(value);
    if (!date) return "Not set";

    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function hasInterviewLocation(interview: Interview) {
    return Boolean(interview.location?.trim() || interview.meetingUrl?.trim());
}

function getInterviewLocationLabel(interview: Interview) {
    const location = interview.location?.trim();
    if (location) return location;
    if (interview.meetingUrl?.trim()) return "Meeting link saved";
    return "Not set";
}

function getSortValue(interview: Interview, sortKey: SortKey) {
    if (sortKey === "scheduledAt") return getInterviewTimestamp(interview);
    if (sortKey === "type") return getInterviewTypeLabel(interview.type).toLowerCase();
    if (sortKey === "outcome")
        return getInterviewOutcomeLabel(interview.outcome).toLowerCase();

    return (interview[sortKey] ?? "").toString().toLowerCase();
}

export function InterviewsView({
    applications,
    focusedInterviewId,
    interviews,
    onCreateInterview,
    onRemoveInterview,
    onOutcomeChange,
    onUpdateNotes,
    onStartEdit,
    onViewApplication,
    onBulkApply,
}: InterviewsViewProps) {
    const [filters, setFilters] = useState<InterviewFilters>(INITIAL_FILTERS);
    const [sortKey, setSortKey] = useState<SortKey>("scheduledAt");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const detailPane = useCollectionDetailPane("jobhazel-interviews-detail-pane", focusedInterviewId);
    const [isDetailMenuOpen, setIsDetailMenuOpen] = useState(false);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notesDraft, setNotesDraft] = useState("");
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(
        Boolean(focusedInterviewId),
    );
    const listScrollPosition = useRef(0);
    const canCreateInterview = applications.length > 0;

    const filteredInterviews = useMemo(() => {
        const query = filters.query.trim().toLowerCase();

        return interviews.filter((interview) => {
            if (query && !getSearchableInterviewText(interview).includes(query))
                return false;
            if (filters.type && interview.type !== filters.type) return false;
            if (filters.outcome && interview.outcome !== filters.outcome) return false;

            return true;
        });
    }, [filters, interviews]);

    const sortedInterviews = useMemo(() => {
        return [...filteredInterviews].sort((left, right) => {
            const leftValue = getSortValue(left, sortKey);
            const rightValue = getSortValue(right, sortKey);
            const directionMultiplier = sortDirection === "asc" ? 1 : -1;

            if (typeof leftValue === "number" && typeof rightValue === "number") {
                return (leftValue - rightValue) * directionMultiplier;
            }

            return String(leftValue).localeCompare(String(rightValue)) * directionMultiplier;
        });
    }, [filteredInterviews, sortDirection, sortKey]);

    const bulk = useBulkSelection(sortedInterviews, JSON.stringify(filters));
    const selectedInterview =
        sortedInterviews.find((interview) => interview.id === detailPane.selectedId) ?? null;
    const selectedInterviewerName =
        selectedInterview?.interviewerName?.trim() ?? "";
    const selectedMeetingUrl = selectedInterview?.meetingUrl?.trim() ?? "";
    const selectedNotes = selectedInterview?.notes?.trim() ?? "";
    const selectedHasInterviewer = Boolean(selectedInterviewerName);
    const selectedHasLocation = selectedInterview
        ? hasInterviewLocation(selectedInterview)
        : false;


    const activeFilterCount = [filters.type, filters.outcome].filter(Boolean).length;
    const activeFilterChips: ActiveFilterChip[] = [
        ...(filters.type ? [{ id: "type", label: "Type", value: getInterviewTypeLabel(filters.type), onRemove: () => setFilters((current) => ({ ...current, type: "" })) }] : []),
        ...(filters.outcome ? [{ id: "status", label: "Status", value: getInterviewOutcomeLabel(filters.outcome), onRemove: () => setFilters((current) => ({ ...current, outcome: "" })) }] : []),
    ];
    const interviewAgendaGroups = [{ label: "", interviews: sortedInterviews }];

    function openMobileDetail(interviewId: string) {
        listScrollPosition.current = window.scrollY;
        detailPane.select(interviewId);
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
        <section className={isMobileDetailOpen ? "applications-page interviews-page mobile-page-detail-open" : "applications-page interviews-page"}>
            <CollectionTabs label="interviews views" value={filters.outcome} options={[{ value: "", label: "All", count: interviews.length }, ...["SCHEDULED", "COMPLETED"].map(value => ({ value, label: getInterviewOutcomeLabel(value), count: interviews.filter(item => item.outcome === value).length }))]} onChange={value => setFilters(current => ({ ...current, outcome: value }))} />
            <div
                ref={detailPane.containerRef}
                style={detailPane.splitStyle}
                className={`applications-split-panel interviews-split-panel${selectedInterview && detailPane.isOpen ? " detail-pane-open" : ""}${isMobileDetailOpen ? " mobile-detail-open" : ""}${detailPane.isDragging ? " is-resizing" : ""}`}
            >
                <aside className="application-list-panel interviews-list-panel">
                    <CollectionListControls
                        activeFilters={<ActiveFilterChips chips={activeFilterChips} />}
                        noun="interviews"
                        search={<label className="applications-search-field">
                            <AppIcon name="search" size={18} />
                            <input
                                aria-label="Search interviews"
                                value={filters.query}
                                onChange={(event) =>
                                    setFilters({ ...filters, query: event.target.value })
                                }
                                placeholder="Search interviews"
                            />
                        </label>}
                        filters={<><select
                            aria-label="Filter interviews by type"
                            value={filters.type}
                            onChange={(event) =>
                                setFilters({ ...filters, type: event.target.value })
                            }
                        >
                            <option value="">All types</option>
                            {INTERVIEW_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {getInterviewTypeLabel(type)}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Filter interviews by status"
                            value={filters.outcome}
                            onChange={(event) =>
                                setFilters({ ...filters, outcome: event.target.value })
                            }
                        >
                            <option value="">All statuses</option>
                            {INTERVIEW_OUTCOMES.map((outcome) => (
                                <option key={outcome} value={outcome}>
                                    {getInterviewOutcomeLabel(outcome)}
                                </option>
                            ))}
                        </select></>}
                        filtersOpen={isFiltersOpen}
                        onToggleFilters={() => setIsFiltersOpen(open => !open)}
                        activeFilterCount={activeFilterCount}
                        hasActiveFilters={Boolean(filters.query.trim() || activeFilterCount)}
                        onReset={() => setFilters(INITIAL_FILTERS)}
                        sortValue={`${sortKey}:${sortDirection}`}
                        sortOptions={[{ value: "scheduledAt:asc", label: "Date: soonest first" }, { value: "scheduledAt:desc", label: "Date: latest first" }, { value: "applicationTitle:asc", label: "Role: A to Z" }, { value: "applicationTitle:desc", label: "Role: Z to A" }, { value: "companyName:asc", label: "Company: A to Z" }, { value: "companyName:desc", label: "Company: Z to A" }, { value: "type:asc", label: "Stage: A to Z" }, { value: "type:desc", label: "Stage: Z to A" }, { value: "outcome:asc", label: "Status: A to Z" }, { value: "outcome:desc", label: "Status: Z to A" }]}
                        onSortChange={value => { const [key, direction] = value.split(":"); setSortKey(key as SortKey); setSortDirection(direction as SortDirection); }}
                    />

                    <BulkActions selection={bulk} count={sortedInterviews.length} noun="interviews" onApply={onBulkApply} fields={[{ key: "outcome", label: "Outcome", options: INTERVIEW_OUTCOMES.map(outcome => ({ value: outcome, label: getInterviewOutcomeLabel(outcome) })) }, { key: "type", label: "Type", options: INTERVIEW_TYPES.map(type => ({ value: type, label: getInterviewTypeLabel(type) })) }]} />

                    {sortedInterviews.length > 0 ? (
                        <>
                            <div className="application-list desktop-record-list" role="list">
                                {sortedInterviews.map((interview) => {
                                    const isSelected =
                                        selectedInterview?.id === interview.id;

                                    return (
                                        <BulkRow key={interview.id} selection={bulk} id={interview.id} label={`${interview.applicationTitle ?? "Interview"} at ${interview.companyName ?? "Unknown company"} on ${formatInterviewDateLabel(interview.scheduledAt)}`}><button
                                            type="button"
                                            className={
                                                isSelected
                                                    ? `application-list-item interview-list-item interviews-table-columns status-accent ${interview.outcome.toLowerCase()} active`
                                                    : "application-list-item interview-list-item interviews-table-columns"
                                            }
                                            aria-current={isSelected ? "true" : undefined}
                                            onClick={() => openMobileDetail(interview.id)}
                                        >
                                            <span className="application-table-cell" data-label="When">
                                                {formatInterviewDateLabel(interview.scheduledAt)} at{" "}
                                                {formatInterviewTimeLabel(interview.scheduledAt)}
                                            </span>
                                            <span className="application-primary-cell">
                                                <strong>{interview.applicationTitle ?? "Unknown role"}</strong>
                                            </span>
                                            <span className="application-table-cell" data-label="Company">
                                                {interview.companyName ?? "Unknown company"}
                                            </span>
                                            <span className="application-table-cell" data-label="Stage">
                                                {getInterviewTypeLabel(interview.type)}
                                            </span>
                                            <span
                                                className={`status-pill ${interview.outcome.toLowerCase()}`}
                                            >
                                                {getInterviewOutcomeLabel(interview.outcome)}
                                            </span>
                                        <AppIcon name="arrow-right" size={18} className="collection-record-chevron" />
                                        </button></BulkRow>
                                    );
                                })}
                            </div>
                            <div className="mobile-grouped-list" role="list" aria-label="Interview agenda">
                                {interviewAgendaGroups.map((group) => (
                                    <section key={group.label} className="mobile-record-group">
                                        {group.label && <h3>{group.label}</h3>}
                                        {group.interviews.map((interview) => (
                                            <BulkRow key={interview.id} selection={bulk} id={interview.id} label={`${interview.applicationTitle ?? "Interview"} at ${interview.companyName ?? "Unknown company"} on ${formatInterviewDateLabel(interview.scheduledAt)}`}><button
                                                type="button"
                                                className={`mobile-agenda-card status-accent ${interview.outcome.toLowerCase()}`}
                                                onClick={() => openMobileDetail(interview.id)}
                                            >
                                                <span className="mobile-agenda-date">
                                                    <strong>{formatInterviewDateLabel(interview.scheduledAt)}</strong>
                                                    <span>{formatInterviewTimeLabel(interview.scheduledAt)}</span>
                                                </span>
                                                <span className="mobile-agenda-copy">
                                                    <strong>{interview.companyName ?? "Unknown company"}</strong>
                                                    <span>{getInterviewTypeLabel(interview.type)} · {interview.applicationTitle ?? "Unknown role"}</span>
                                                    <small><AppIcon name={interview.meetingUrl?.trim() ? "external-link" : "location"} size={14} /> {getInterviewLocationLabel(interview)}</small>
                                                </span>
                                                <span className={`status-pill ${interview.outcome.toLowerCase()}`}>
                                                    {getInterviewOutcomeLabel(interview.outcome)}
                                                </span>
                                                <AppIcon name="arrow-right" size={18} className="mobile-record-chevron" />
                                            </button></BulkRow>
                                        ))}
                                    </section>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="applications-empty application-list-empty interviews-empty">
                            <span className="empty-illustration">
                                <AppIcon name="calendar" size={31} />
                            </span>
                            <h2>
                                {interviews.length === 0
                                    ? "No interviews scheduled"
                                    : "No interviews match these filters"}
                            </h2>
                            <p>
                                {interviews.length === 0
                                    ? "Schedule interviews from an application to track next steps."
                                    : "Clear filters or adjust the search terms to expand the table."}
                            </p>
                            <AddInterviewButton
                                className="secondary"
                                onClick={onCreateInterview}
                                disabled={!canCreateInterview}
                            />
                        </div>
                    )}
                </aside>

                {selectedInterview && detailPane.isOpen && <CollectionPaneDivider onResizeStart={detailPane.beginResize} onResizeBy={detailPane.resizeWithKeyboard} />}
                <aside
                    className={`application-detail-panel interview-detail-panel status-accent ${selectedInterview?.outcome.toLowerCase() ?? ""}`}
                    aria-label="Selected interview"
                >
                    {selectedInterview ? (
                        <>
                            <button type="button" className="mobile-detail-back" onClick={closeMobileDetail}>
                                <AppIcon name="arrow-left" size={20} />
                                Interviews
                            </button>
                            <CollectionPaneCollapse label="interview" onCollapse={() => { detailPane.collapse(); setIsMobileDetailOpen(false); }} />
                            <header className="application-detail-header interview-detail-header">
                                <div className="application-detail-top-row">
                                    <div className="application-detail-heading">
                                        <h2>{selectedInterview.applicationTitle ?? "Unknown role"}</h2>
                                        <p className="application-detail-company-location">
                                            <span className="application-detail-context-item application-detail-company">
                                                <AppIcon name="company" size={20} />
                                                {selectedInterview.companyName ?? "Unknown company"}
                                            </span>
                                            <span className="application-detail-context-separator" aria-hidden="true" />
                                            <span className="application-detail-context-item">
                                                <AppIcon name="location" size={20} />
                                                {selectedInterview.location || "Location not set"}
                                            </span>
                                        </p>
                                        <div className="application-detail-status-row">
                                            <label className="application-detail-status-control">
                                                <select aria-label="Interview status" className={`status-select ${selectedInterview.outcome.toLowerCase()}`} value={selectedInterview.outcome} onChange={(event) => onOutcomeChange(selectedInterview.id, event.target.value)}>
                                                    {INTERVIEW_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{getInterviewOutcomeLabel(outcome)}</option>)}
                                                </select>
                                            </label>
                                            <span className="detail-type-label">
                                                <AppIcon name="contacts" size={18} />
                                                {getInterviewTypeLabel(selectedInterview.type)} interview
                                            </span>
                                        </div>
                                    </div>
                                    <div
                                        className="application-detail-header-actions"
                                        aria-label="Interview actions"
                                    >
                                        <button
                                            type="button"
                                            className="alternative"
                                            aria-label="Edit interview"
                                            onClick={() => onStartEdit(selectedInterview)}
                                        >
                                            <AppIcon name="edit" size={25} />
                                        </button>
                                        <div className="application-detail-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDetailMenuOpen(false); }}>
                                            <button type="button" className="application-detail-menu-trigger" aria-label="More interview actions" aria-haspopup="menu" aria-expanded={isDetailMenuOpen} onClick={() => setIsDetailMenuOpen((open) => !open)}><AppIcon name="dots-vertical" size={25} /></button>
                                            {isDetailMenuOpen && <div className="application-detail-menu-popover" role="menu">
                                                <button type="button" role="menuitem" className="danger-text" onClick={() => { setIsDetailMenuOpen(false); onRemoveInterview(selectedInterview.id); }}><AppIcon name="trash" size={15} /> Delete interview</button>
                                            </div>}
                                        </div>
                                    </div>
                                </div>
                                <div className="application-detail-summary" aria-label="Interview summary">

                                    <button type="button" className="application-detail-posting-link" onClick={() => onViewApplication(selectedInterview.applicationId)}><AppIcon name="applications" size={15} /> View application</button>
                                </div>
                            </header>

                            <div className="interview-detail-body">
                                <section
                                    className="detail-facts-section"
                                    aria-labelledby="interview-details-heading"
                                >
                                    <h3 id="interview-details-heading">Interview details</h3>
                                    <dl className="interview-detail-facts">
                                        <div className="interview-detail-fact interview-detail-fact-primary">
                                            <dt>
                                                <span className="interview-detail-fact-icon">
                                                    <AppIcon name="calendar" size={18} />
                                                </span>
                                                Date
                                            </dt>
                                            <dd>
                                                <strong>
                                                    {formatInterviewDateLabel(
                                                        selectedInterview.scheduledAt,
                                                        true,
                                                    )}
                                                </strong>
                                                <span>
                                                    {formatInterviewTimeLabel(
                                                        selectedInterview.scheduledAt,
                                                    )}
                                                    {" - "}
                                                    {formatInterviewDuration(
                                                        selectedInterview.durationMinutes,
                                                    )}
                                                </span>
                                            </dd>
                                        </div>

                                        <div
                                            className={
                                                selectedHasInterviewer
                                                    ? "interview-detail-fact"
                                                    : "interview-detail-fact is-missing"
                                            }
                                        >
                                            <dt>
                                                <span className="interview-detail-fact-icon">
                                                    <AppIcon name="account" size={18} />
                                                </span>
                                                Interviewer
                                            </dt>
                                            <dd>
                                                <strong>
                                                    {selectedInterviewerName || "Not set"}
                                                </strong>
                                                <span>
                                                    {selectedHasInterviewer
                                                        ? "Contact saved"
                                                        : "Needs a name"}
                                                </span>
                                            </dd>
                                        </div>

                                        <div
                                            className={
                                                selectedHasLocation
                                                    ? "interview-detail-fact"
                                                    : "interview-detail-fact is-missing"
                                            }
                                        >
                                            <dt>
                                                <span className="interview-detail-fact-icon">
                                                    <AppIcon name="location" size={18} />
                                                </span>
                                                Location
                                            </dt>
                                            <dd>
                                                <strong>
                                                    {getInterviewLocationLabel(
                                                        selectedInterview,
                                                    )}
                                                </strong>
                                                {selectedMeetingUrl ? (
                                                    <a
                                                        className="interview-detail-link"
                                                        href={selectedMeetingUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        Open meeting link
                                                    </a>
                                                ) : (
                                                    <span>
                                                        {selectedHasLocation
                                                            ? "Location saved"
                                                            : "Needs a location or link"}
                                                    </span>
                                                )}
                                            </dd>
                                        </div>
                                    </dl>
                                </section>

                                <div className="interview-detail-content-grid">
                                    <section className="application-detail-section application-detail-card-section interview-notes-card">
                                        <div className="interview-detail-section-title">
                                            <div className="interview-notes-card-title">
                                                <h3>Notes</h3>
                                            </div>
                                            {!isEditingNotes && <button type="button" className="alternative application-section-action" onClick={() => { setNotesDraft(selectedNotes); setIsEditingNotes(true); }}>Edit notes</button>}
                                        </div>
                                        {isEditingNotes ? <div className="application-notes-editor">
                                            <textarea aria-label="Interview notes" autoFocus value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} placeholder="Write a note…" />
                                            <div className="application-notes-editor-actions"><button type="button" className="secondary" disabled={isSavingNotes} onClick={() => setIsEditingNotes(false)}>Cancel</button><button type="button" className="primary" disabled={isSavingNotes} onClick={async () => { setIsSavingNotes(true); try { await onUpdateNotes(selectedInterview.id, notesDraft); setIsEditingNotes(false); } catch { } finally { setIsSavingNotes(false); } }}>{isSavingNotes ? "Saving…" : "Save notes"}</button></div>
                                        </div> : <p className={selectedNotes ? "" : "is-empty"}>
                                            {!selectedNotes && <AppIcon name="document" size={22} />}
                                            {selectedNotes || "No notes added"}
                                        </p>}
                                    </section>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="applications-empty">
                            <span className="empty-illustration">
                                <AppIcon name="calendar" size={31} />
                            </span>
                            <h2>Select an interview</h2>
                            <p>Choose an interview from the list to review its details.</p>
                        </div>
                    )}
                </aside>
            </div>
        </section>
    );
}
