"use client";

import { BulkActions, BulkRow, useBulkSelection, type BulkHandler } from "./BulkActions";

import { useTaskTimeZone } from "../lib/task-timezone";

import { useRef, useState } from "react";

import { TASK_TYPES } from "../lib/constants";
import {
    formatTaskDueDate,
    getTaskDueState,
    getTaskTypeLabel,
    isOpenTask,
    sortTasksByDueDate,
    type TaskDueState,
} from "../lib/task-utils";
import type {
    Application,
    Task,
} from "../lib/types";
import { AppIcon } from "./AppIcon";
import { CollectionTabs } from "./CollectionTabs";
import { CollectionListControls } from "./CollectionListControls";
import { ActiveFilterChips, type ActiveFilterChip } from "./ActiveFilterChips";
import { CollectionPaneCollapse, CollectionPaneDivider } from "./CollectionPaneControls";
import { useCollectionDetailPane } from "./useCollectionDetailPane";

type TasksViewProps = {
    onBulkApply?: BulkHandler;
    applications: Application[];
    tasks: Task[];
    onCompleteTask: (id: string) => void | Promise<void>;
    onCreateTask: (applicationId?: string) => void;
    onRemoveTask: (id: string) => void | Promise<void>;
    onStartEdit: (task: Task) => void;
    onUpdateDescription: (id: string, description: string) => Promise<void>;
    onViewApplication: (id: string) => void;
};

type TaskFilters = {
    query: string;
    type: string;
    status: "" | TaskDueState;
    applicationId: string;
};

type SortKey = "dueDate" | "title" | "applicationTitle" | "type" | "status";
type SortDirection = "asc" | "desc";

const INITIAL_FILTERS: TaskFilters = {
    query: "",
    type: "",
    status: "",
    applicationId: "",
};

const TASK_STATUS_LABELS: Record<TaskDueState, string> = {
    completed: "Completed",
    overdue: "Overdue",
    today: "Due today",
    upcoming: "Upcoming",
    unscheduled: "No due date",
};

const TASK_STATUS_FILTERS: Array<{ value: TaskFilters["status"]; label: string }> = [
    { value: "", label: "All statuses" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Due today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "unscheduled", label: "No due date" },
    { value: "completed", label: "Completed" },
];

function getSearchableTaskText(task: Task, timeZone: string) {
    return [
        task.title,
        task.description,
        task.applicationTitle,
        task.companyName,
        getTaskTypeLabel(task.type),
        TASK_STATUS_LABELS[getTaskDueState(task, timeZone)],
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function getSortValue(task: Task, sortKey: SortKey, timeZone: string) {
    if (sortKey === "dueDate") return sortTasksByDueDate([task])[0]?.dueDate ?? "";
    if (sortKey === "type") return getTaskTypeLabel(task.type).toLowerCase();
    if (sortKey === "status") return TASK_STATUS_LABELS[getTaskDueState(task, timeZone)];

    return (task[sortKey] ?? "").toString().toLowerCase();
}

function getTaskApplicationLabel(task: Task) {
    if (!task.applicationTitle) return "No linked application";
    return `${task.applicationTitle} at ${task.companyName ?? "Unknown company"}`;
}

function getTaskStatusClass(task: Task, timeZone: string) {
    return getTaskDueState(task, timeZone).replace("unscheduled", "no-due-date");
}

export function TasksView({
    applications,
    tasks,
    onCompleteTask,
    onCreateTask,
    onRemoveTask,
    onStartEdit,
    onUpdateDescription,
    onViewApplication,
    onBulkApply,
}: TasksViewProps) {
    const { timeZone } = useTaskTimeZone();
    const [filters, setFilters] = useState<TaskFilters>(INITIAL_FILTERS);
    const [sortKey, setSortKey] = useState<SortKey>("dueDate");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const detailPane = useCollectionDetailPane("jobhazel-tasks-detail-pane");
    const [isDetailMenuOpen, setIsDetailMenuOpen] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [isSavingDescription, setIsSavingDescription] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);
    const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
    const listScrollPosition = useRef(0);


    const filteredTasks = (() => {
        const query = filters.query.trim().toLowerCase();

        return tasks.filter((task) => {
            if (query && !getSearchableTaskText(task, timeZone).includes(query)) return false;
            if (filters.type && task.type !== filters.type) return false;
            if (filters.status && getTaskDueState(task, timeZone) !== filters.status)
                return false;
            if (filters.applicationId && task.applicationId !== filters.applicationId)
                return false;

            return true;
        });
    })();

    const sortedTasks = (() => {
        const baseTasks =
            sortKey === "dueDate" ? sortTasksByDueDate(filteredTasks) : [...filteredTasks];

        if (sortKey === "dueDate") {
            return sortDirection === "asc" ? baseTasks : [...baseTasks].reverse();
        }

        return baseTasks.sort((left, right) => {
            const leftValue = getSortValue(left, sortKey, timeZone);
            const rightValue = getSortValue(right, sortKey, timeZone);
            const directionMultiplier = sortDirection === "asc" ? 1 : -1;
            return String(leftValue).localeCompare(String(rightValue)) * directionMultiplier;
        });
    })();

    const bulk = useBulkSelection(sortedTasks, JSON.stringify(filters));
    const selectedTask =
        sortedTasks.find((task) => task.id === detailPane.selectedId) ?? null;
    const selectedTaskApplication = selectedTask?.applicationId
        ? applications.find((application) => application.id === selectedTask.applicationId) ?? null
        : null;
    const selectedDescription = selectedTask?.description?.trim() ?? "";
    const activeFilterCount = [
        filters.type,
        filters.status,
        filters.applicationId,
    ].filter(Boolean).length;
    const activeFilterChips: ActiveFilterChip[] = [
        ...(filters.type ? [{ id: "type", label: "Type", value: getTaskTypeLabel(filters.type), onRemove: () => setFilters((current) => ({ ...current, type: "" })) }] : []),
        ...(filters.status ? [{ id: "status", label: "Status", value: TASK_STATUS_LABELS[filters.status], onRemove: () => setFilters((current) => ({ ...current, status: "" })) }] : []),
        ...(filters.applicationId ? [{
            id: "application",
            label: "Application",
            value: applications.find((application) => application.id === filters.applicationId)?.title ?? "Selected application",
            onRemove: () => setFilters((current) => ({ ...current, applicationId: "" })),
        }] : []),
    ];
    const taskActionGroups = [{ label: "", tasks: sortedTasks }];

    function openMobileDetail(taskId: string) {
        listScrollPosition.current = window.scrollY;
        detailPane.select(taskId);
        setIsEditingDescription(false);
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
        <section className={isMobileDetailOpen ? "applications-page tasks-page mobile-page-detail-open" : "applications-page tasks-page"}>
            <CollectionTabs label="tasks views" value={filters.status} options={[{ value: "", label: "All", count: tasks.length }, ...(["today", "overdue", "completed"] as const).map(value => ({ value, label: TASK_STATUS_LABELS[value], count: tasks.filter(item => getTaskDueState(item, timeZone) === value).length }))]} onChange={value => setFilters(current => ({ ...current, status: value as TaskFilters["status"] }))} />
            <div
                ref={detailPane.containerRef}
                style={detailPane.splitStyle}
                className={`applications-split-panel tasks-split-panel${selectedTask && detailPane.isOpen ? " detail-pane-open" : ""}${isMobileDetailOpen ? " mobile-detail-open" : ""}${detailPane.isDragging ? " is-resizing" : ""}`}
            >
                <aside className="application-list-panel tasks-list-panel">
                    <CollectionListControls
                        activeFilters={<ActiveFilterChips chips={activeFilterChips} />}
                        noun="tasks"
                        search={<label className="applications-search-field">
                            <AppIcon name="search" size={18} />
                            <input
                                aria-label="Search tasks"
                                value={filters.query}
                                onChange={(event) =>
                                    setFilters({ ...filters, query: event.target.value })
                                }
                                placeholder="Search tasks"
                            />
                        </label>}
                        filters={<><select
                            aria-label="Filter tasks by type"
                            value={filters.type}
                            onChange={(event) =>
                                setFilters({ ...filters, type: event.target.value })
                            }
                        >
                            <option value="">All types</option>
                            {TASK_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {getTaskTypeLabel(type)}
                                </option>
                            ))}
                        </select>
                        <select
                            aria-label="Filter tasks by status"
                            value={filters.status}
                            onChange={(event) =>
                                setFilters({
                                    ...filters,
                                    status: event.target.value as TaskFilters["status"],
                                })
                            }
                        >
                            {TASK_STATUS_FILTERS.map((status) => (
                                <option key={status.value || "all"} value={status.value}>
                                    {status.label}
                                </option>
                            ))}
                        </select></>}
                        filtersOpen={isFiltersOpen}
                        onToggleFilters={() => setIsFiltersOpen(open => !open)}
                        activeFilterCount={activeFilterCount}
                        hasActiveFilters={Boolean(filters.query.trim() || activeFilterCount)}
                        onReset={() => setFilters(INITIAL_FILTERS)}
                        sortValue={`${sortKey}:${sortDirection}`}
                        sortOptions={[{ value: "dueDate:asc", label: "Due date: soonest first" }, { value: "dueDate:desc", label: "Due date: latest first" }, { value: "title:asc", label: "Task: A to Z" }, { value: "title:desc", label: "Task: Z to A" }, { value: "applicationTitle:asc", label: "Application: A to Z" }, { value: "applicationTitle:desc", label: "Application: Z to A" }, { value: "type:asc", label: "Type: A to Z" }, { value: "type:desc", label: "Type: Z to A" }, { value: "status:asc", label: "Status: A to Z" }, { value: "status:desc", label: "Status: Z to A" }]}
                        onSortChange={value => { const [key, direction] = value.split(":"); setSortKey(key as SortKey); setSortDirection(direction as SortDirection); }}
                    />

                    <BulkActions selection={bulk} count={sortedTasks.length} noun="tasks" onApply={onBulkApply} fields={[{ key: "type", label: "Type", options: TASK_TYPES.map(type => ({ value: type, label: getTaskTypeLabel(type) })) }]} />

                    {sortedTasks.length > 0 ? (
                        <>
                        <div className="application-list desktop-record-list" role="list">
                            {sortedTasks.map((task) => {
                                const state = getTaskDueState(task, timeZone);
                                const isSelected = selectedTask?.id === task.id;
                                const isCompleted = !isOpenTask(task);

                                return (
                                    <BulkRow key={task.id} selection={bulk} id={task.id} label={task.title}><div
                                        role="button"
                                        tabIndex={0}
                                        className={
                                            isSelected
                                                ? `application-list-item task-list-item tasks-table-columns status-accent ${getTaskStatusClass(task, timeZone)} active`
                                                : "application-list-item task-list-item tasks-table-columns"
                                        }
                                        aria-current={isSelected ? "true" : undefined}
                                        onClick={() => openMobileDetail(task.id)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                openMobileDetail(task.id);
                                            }
                                        }}
                                    >
                                        <span className="application-primary-cell-task">
                                            <input
                                                type="checkbox"
                                                className="task-list-checkbox"
                                                checked={isCompleted}
                                                aria-label={`Mark ${task.title} ${isCompleted ? "not completed" : "completed"}`}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={() => onCompleteTask(task.id)}
                                            />
                                            <strong>{task.title}</strong>
                                        </span>
                                        <span className="application-table-cell" data-label="Application">
                                            {getTaskApplicationLabel(task)}
                                        </span>
                                        <span className="application-table-cell" data-label="Due">
                                            {formatTaskDueDate(task.dueDate, timeZone)}
                                        </span>
                                        <span className="application-table-cell" data-label="Type">
                                            {getTaskTypeLabel(task.type)}
                                        </span>
                                        <span
                                            className={`status-pill ${getTaskStatusClass(task, timeZone)}`}
                                        >
                                            {TASK_STATUS_LABELS[state]}
                                        </span>
                                        <AppIcon name="arrow-right" size={18} className="collection-record-chevron" />
                                    </div></BulkRow>
                                );
                            })}
                        </div>
                        <div className="mobile-grouped-list" role="list" aria-label="Tasks by due state">
                            {taskActionGroups.map((group) => (
                                <section key={group.label} className="mobile-record-group">
                                    {group.label && <h3>{group.label}</h3>}
                                    {group.tasks.map((task) => {
                                        const state = getTaskDueState(task, timeZone);
                                        const isCompleted = !isOpenTask(task);
                                        return (
                                            <BulkRow key={task.id} selection={bulk} id={task.id} label={task.title}><div
                                                role="button"
                                                tabIndex={0}
                                                className={`mobile-task-card status-accent ${getTaskStatusClass(task, timeZone)}`}
                                                onClick={() => openMobileDetail(task.id)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" || event.key === " ") {
                                                        event.preventDefault();
                                                        openMobileDetail(task.id);
                                                    }
                                                }}
                                            >
                                                <span className="mobile-task-checkbox-target" onClick={(event) => event.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        className="task-list-checkbox"
                                                        checked={isCompleted}
                                                        aria-label={`Mark ${task.title} ${isCompleted ? "not completed" : "completed"}`}
                                                        onChange={() => onCompleteTask(task.id)}
                                                    />
                                                </span>
                                                <span className="mobile-agenda-copy">
                                                    <strong>{task.title}</strong>
                                                    <span>{task.companyName ?? "No linked company"}</span>
                                                    <small>{formatTaskDueDate(task.dueDate, timeZone)} · {getTaskTypeLabel(task.type)}</small>
                                                </span>
                                                <span className={`status-pill ${getTaskStatusClass(task, timeZone)}`}>
                                                    {TASK_STATUS_LABELS[state]}
                                                </span>
                                                <AppIcon name="arrow-right" size={18} className="mobile-record-chevron" />
                                            </div></BulkRow>
                                        );
                                    })}
                                </section>
                            ))}
                        </div>
                        </>
                    ) : (
                        <div className="applications-empty application-list-empty tasks-empty">
                            <span className="empty-illustration">
                                <AppIcon name="checklist" size={31} />
                            </span>
                            <h2>
                                {tasks.length === 0
                                    ? "No tasks yet"
                                    : "No tasks match these filters"}
                            </h2>
                            <p>
                                {tasks.length === 0
                                    ? "Create a task or enable automation to track follow-ups."
                                    : "Clear filters or adjust the search terms to expand the list."}
                            </p>
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => onCreateTask()}
                            >
                                <AppIcon name="plus" size={18} />
                                Create Task
                            </button>
                        </div>
                    )}
                </aside>

                {selectedTask && detailPane.isOpen && <CollectionPaneDivider onResizeStart={detailPane.beginResize} onResizeBy={detailPane.resizeWithKeyboard} />}
                <aside
                    className={`application-detail-panel task-detail-panel status-accent ${selectedTask ? getTaskStatusClass(selectedTask, timeZone) : ""}`}
                    aria-label="Selected task"
                >
                    {selectedTask ? (
                        <>
                            <button type="button" className="mobile-detail-back" onClick={closeMobileDetail}>
                                <AppIcon name="arrow-left" size={20} />
                                Tasks
                            </button>
                            <CollectionPaneCollapse label="task" onCollapse={() => { detailPane.collapse(); setIsMobileDetailOpen(false); }} />
                            <header className="application-detail-header task-detail-header">
                                <div className="application-detail-top-row">
                                    <div className="application-detail-heading">
                                        <h2>{selectedTask.title}</h2>
                                    </div>
                                    <div className="application-detail-header-actions">
                                        <button
                                            type="button"
                                            className="alternative"
                                            aria-label="Edit task"
                                            onClick={() => onStartEdit(selectedTask)}
                                        >
                                            <AppIcon name="edit" size={25} />
                                        </button>
                                        <div className="application-detail-menu" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDetailMenuOpen(false); }}>
                                            <button type="button" className="application-detail-menu-trigger" aria-label="More task actions" aria-haspopup="menu" aria-expanded={isDetailMenuOpen} onClick={() => setIsDetailMenuOpen((open) => !open)}><AppIcon name="dots-vertical" size={25} /></button>
                                            {isDetailMenuOpen && <div className="application-detail-menu-popover" role="menu">
                                                {isOpenTask(selectedTask) && <button type="button" role="menuitem" onClick={() => { setIsDetailMenuOpen(false); onCompleteTask(selectedTask.id); }}><AppIcon name="check" size={15} /> Mark complete</button>}
                                                <button type="button" role="menuitem" className="danger-text" onClick={() => { setIsDetailMenuOpen(false); onRemoveTask(selectedTask.id); }}><AppIcon name="trash" size={15} /> Delete task</button>
                                            </div>}
                                        </div>
                                    </div>
                                </div>
                                <p className="application-detail-company-location">
                                    <span className="application-detail-context-item application-detail-company">
                                        <AppIcon name="company" size={20} />
                                        {selectedTask.companyName ?? "Unknown company"}
                                    </span>
                                    <span className="application-detail-context-separator" aria-hidden="true" />
                                    <span className="application-detail-context-item">
                                        <AppIcon name="location" size={20} />
                                        {selectedTaskApplication?.location || "Location not set"}
                                    </span>
                                </p>
                                <div className="application-detail-status-row">
                                    <label className="application-detail-status-control">
                                        <select aria-label="Task status" className={`status-select ${getTaskStatusClass(selectedTask, timeZone)}`} value={getTaskDueState(selectedTask, timeZone)} onChange={(event) => { if (event.target.value === "completed") onCompleteTask(selectedTask.id); if (event.target.value === "edit") onStartEdit(selectedTask); }}>
                                            <option value={getTaskDueState(selectedTask, timeZone)}>{TASK_STATUS_LABELS[getTaskDueState(selectedTask, timeZone)]}</option>
                                            {isOpenTask(selectedTask) && <option value="completed">Completed</option>}
                                            <option value="edit">Edit task details…</option>
                                        </select>
                                    </label>
                                </div>
                                <div className="application-detail-summary" aria-label="Task summary">
                                    <span><AppIcon name="checklist" size={19} /> {getTaskTypeLabel(selectedTask.type)} task</span>
                                    {selectedTask.applicationId && (
                                        <button
                                            type="button"
                                            className="application-detail-posting-link"
                                            onClick={() => onViewApplication(selectedTask.applicationId!)}
                                        >
                                            <AppIcon name="applications" size={15} />
                                            View application
                                        </button>
                                    )}
                                </div>
                            </header>

                            <div className="interview-detail-body task-detail-body">
                                <section
                                    className="detail-facts-section"
                                    aria-labelledby="task-details-heading"
                                >
                                    <h3 id="task-details-heading">Task details</h3>
                                    <dl className="interview-detail-facts task-detail-facts">
                                    <div className="interview-detail-fact interview-detail-fact-primary">
                                        <dt>
                                            <span className="interview-detail-fact-icon">
                                                <AppIcon name="calendar" size={18} />
                                            </span>
                                            Due
                                        </dt>
                                        <dd>
                                            <strong>
                                                {formatTaskDueDate(selectedTask.dueDate, timeZone)}
                                            </strong>
                                            <span>
                                                {
                                                    TASK_STATUS_LABELS[
                                                    getTaskDueState(selectedTask, timeZone)
                                                    ]
                                                }
                                            </span>
                                        </dd>
                                    </div>

                                    <div className="interview-detail-fact">
                                        <dt>
                                            <span className="interview-detail-fact-icon">
                                                <AppIcon name="applications" size={18} />
                                            </span>
                                            Application
                                        </dt>
                                        <dd>
                                            <strong>
                                                {selectedTask.applicationTitle ??
                                                    "Not linked"}
                                            </strong>
                                            <span>
                                                {selectedTask.companyName ??
                                                    "No company linked"}
                                            </span>
                                        </dd>
                                    </div>

                                    <div className="interview-detail-fact">
                                        <dt>
                                            <span className="interview-detail-fact-icon">
                                                <AppIcon name="checklist" size={18} />
                                            </span>
                                            Type
                                        </dt>
                                        <dd>
                                            <strong>
                                                {getTaskTypeLabel(selectedTask.type)}
                                            </strong>
                                            <span>
                                                {selectedTask.completedAt
                                                    ? `Completed ${formatTaskDueDate(
                                                        selectedTask.completedAt, timeZone,
                                                    )}`
                                                    : "Open task"}
                                            </span>
                                        </dd>
                                    </div>
                                    </dl>
                                </section>

                                <section className="collection-notes-section">
                                    <div className="collection-notes-heading">
                                        <div className="interview-notes-card-title">
                                            <h3>Description</h3>
                                        </div>
                                        {!isEditingDescription && <button type="button" className="alternative application-section-action" onClick={() => { setDescriptionDraft(selectedDescription); setIsEditingDescription(true); }}>Edit description</button>}
                                    </div>
                                    {isEditingDescription ? <div className="application-notes-editor">
                                        <textarea aria-label="Task description" autoFocus value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} placeholder="Write a description…" />
                                        <div className="application-notes-editor-actions"><button type="button" className="secondary" disabled={isSavingDescription} onClick={() => setIsEditingDescription(false)}>Cancel</button><button type="button" className="primary" disabled={isSavingDescription} onClick={async () => { setIsSavingDescription(true); try { await onUpdateDescription(selectedTask.id, descriptionDraft); setIsEditingDescription(false); } catch { } finally { setIsSavingDescription(false); } }}>{isSavingDescription ? "Saving…" : "Save description"}</button></div>
                                    </div> : <p className={selectedDescription ? "" : "is-empty"}>
                                        {!selectedDescription && <AppIcon name="document" size={22} />}
                                        {selectedDescription || "No description added"}
                                    </p>}
                                </section>
                            </div>
                        </>
                    ) : (
                        <div className="applications-empty">
                            <span className="empty-illustration">
                                <AppIcon name="checklist" size={31} />
                            </span>
                            <h2>Select a task</h2>
                            <p>Choose a task from the list to review its details.</p>
                        </div>
                    )}
                </aside>
            </div>
        </section>
    );
}
