"use client";

import { useTaskTimeZone } from "../../lib/task-timezone";

import {
    formatInterviewDateTime,
    getInterviewTypeLabel,
} from "../../lib/interview-utils";
import { getApplicationTimestamp } from "../../lib/application-analytics";
import {
    formatTaskDueDate,
    getTaskDueState,
    getTaskTypeLabel,
    isOpenTask,
    sortTasksByDueDate,
} from "../../lib/task-utils";
import type { Application, Interview, Task } from "../../lib/types";
import { AddInterviewButton } from "../AddInterviewButton";
import { AppIcon } from "../AppIcon";

const APPLICATION_GOAL_TARGET = 20;
const SUBMITTED_APPLICATION_STATUSES = new Set([
    "APPLIED",
    "INTERVIEWING",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
]);

type DashboardCardsProps = {
    applications: Application[];
    canCreateInterview: boolean;
    tasks: Task[];
    upcomingInterviews: Interview[];
    onCreateApplication: () => void;
    onCreateInterview: () => void;
    onCreateTask: () => void;
    onViewApplications: () => void;
    onViewInterviews: () => void;
    onViewTasks: () => void;
};

export function DashboardCards({
    applications,
    canCreateInterview,
    tasks,
    upcomingInterviews,
    onCreateApplication,
    onCreateInterview,
    onCreateTask,
    onViewApplications,
    onViewInterviews,
    onViewTasks,
}: DashboardCardsProps) {
    const { timeZone } = useTaskTimeZone();
    const visibleInterviews = upcomingInterviews.slice(0, 3);
    const visibleTasks = sortTasksByDueDate(tasks.filter(isOpenTask)).slice(0, 3);
    const today = new Date();
    const submittedApplications = applications.filter((application) =>
        SUBMITTED_APPLICATION_STATUSES.has(application.status),
    );
    const monthlySubmittedApplications = submittedApplications.filter((application) => {
        const applicationDate = new Date(getApplicationTimestamp(application));

        return (
            applicationDate.getFullYear() === today.getFullYear() &&
            applicationDate.getMonth() === today.getMonth()
        );
    }).length;
    const activeApplications = applications.filter((application) =>
        ["APPLIED", "INTERVIEWING", "OFFER"].includes(application.status),
    ).length;
    const interviewingApplications = applications.filter(
        (application) => application.status === "INTERVIEWING",
    ).length;
    const goalProgress = Math.min(
        100,
        Math.round((monthlySubmittedApplications / APPLICATION_GOAL_TARGET) * 100),
    );
    const remainingGoalApplications = Math.max(
        APPLICATION_GOAL_TARGET - monthlySubmittedApplications,
        0,
    );

    return (
        <section className="mini-grid">
            <div
                className={
                    visibleInterviews.length
                        ? "panel empty-card upcoming-card"
                        : "panel empty-card"
                }
            >
                <h2>
                    <span>
                        <span className="heading-icon">
                            <AppIcon name="calendar" size={16} />
                        </span>
                        Upcoming Interviews
                    </span>
                    <button
                        type="button"
                        className="card-link"
                        onClick={onViewInterviews}
                    >
                        View all
                    </button>
                </h2>
                {visibleInterviews.length ? (
                    <div className="interview-card-list">
                        {visibleInterviews.map((interview) => (
                            <article key={interview.id} className="interview-card-item">
                                <strong>
                                    {interview.applicationTitle ?? "Unknown role"}
                                </strong>
                                <span>
                                    {interview.companyName ?? "Unknown company"}
                                </span>
                                <div className="interview-card-item-container">
                                    <small>
                                        <AppIcon name="clock" size={13} />
                                        {formatInterviewDateTime(interview.scheduledAt)}
                                    </small>
                                    <em>{getInterviewTypeLabel(interview.type)}</em>
                                </div>
                            </article>
                        ))}
                        <AddInterviewButton
                            className="secondary small"
                            onClick={onCreateInterview}
                            disabled={!canCreateInterview}
                            iconSize={15}
                        />
                    </div>
                ) : (
                    <>
                        <div className="empty-illustration">
                            <AppIcon name="calendar" size={38} strokeWidth={1.5} />
                        </div>
                        <h3>No interviews scheduled yet</h3>
                        <p>When you schedule interviews, they&apos;ll appear here.</p>
                        <AddInterviewButton
                            className="secondary small"
                            onClick={onCreateInterview}
                            disabled={!canCreateInterview}
                            iconSize={15}
                        />
                    </>
                )}
            </div>
            <div
                className={
                    visibleTasks.length
                        ? "panel empty-card upcoming-card task-card"
                        : "panel empty-card"
                }
            >
                <h2>
                    <span>
                        <span className="heading-icon">
                            <AppIcon name="checklist" size={16} />
                        </span>
                        Tasks & Follow-Ups
                    </span>
                    <button type="button" className="card-link" onClick={onViewTasks}>
                        View all
                    </button>
                </h2>
                {visibleTasks.length ? (
                    <div className="interview-card-list task-card-list">
                        {visibleTasks.map((task) => (
                            <article key={task.id} className="interview-card-item">
                                <strong>{task.title}</strong>
                                <span>
                                    {task.applicationTitle
                                        ? `${task.applicationTitle} at ${
                                            task.companyName ?? "Unknown company"
                                        }`
                                        : "No linked application"}
                                </span>
                                <div className="interview-card-item-container">
                                    <small>
                                        <AppIcon name="clock" size={13} />
                                        {formatTaskDueDate(task.dueDate, timeZone)}
                                    </small>
                                    <em className={getTaskDueState(task, timeZone)}>
                                        {getTaskTypeLabel(task.type)}
                                    </em>
                                </div>
                            </article>
                        ))}
                        <button
                            type="button"
                            className="secondary small"
                            onClick={onCreateTask}
                        >
                            <AppIcon name="plus" size={15} />
                            Create Task
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="empty-illustration">
                            <AppIcon name="checklist" size={38} strokeWidth={1.5} />
                        </div>
                        <h3>No tasks yet</h3>
                        <p>Create follow-up tasks and never miss a beat.</p>
                        <button
                            type="button"
                            className="secondary small"
                            onClick={onCreateTask}
                        >
                            <AppIcon name="plus" size={15} />
                            Create Task
                        </button>
                    </>
                )}
            </div>
            <div className="panel empty-card goal-card">
                <h2>
                    <span>
                        <span className="heading-icon">
                            <AppIcon name="trend" size={16} />
                        </span>
                        Application Goal Progress
                    </span>
                    <button
                        type="button"
                        className="card-link"
                        onClick={onViewApplications}
                    >
                        View all
                    </button>
                </h2>
                <div className="goal-progress-summary">
                    <div
                        className="goal-progress-dial"
                        role="progressbar"
                        aria-label="Monthly application goal progress"
                        aria-valuemin={0}
                        aria-valuemax={APPLICATION_GOAL_TARGET}
                        aria-valuenow={monthlySubmittedApplications}
                        style={{
                            background: `conic-gradient(#0b6bff ${goalProgress}%, #e6edf7 0)`,
                        }}
                    >
                        <span>
                            <strong>{goalProgress}%</strong>
                        </span>
                    </div>
                    <div className="goal-progress-copy">
                        <strong>
                            {monthlySubmittedApplications} of {APPLICATION_GOAL_TARGET}
                        </strong>
                        <span>submitted this month</span>
                        <p>
                            {remainingGoalApplications
                                ? `${remainingGoalApplications} applications to go.`
                                : "Monthly application goal reached."}
                        </p>
                    </div>
                </div>
                <div className="goal-stat-row">
                    <span>
                        <strong>{submittedApplications.length}</strong>
                        <small>Total submitted</small>
                    </span>
                    <span>
                        <strong>{activeApplications}</strong>
                        <small>Active now</small>
                    </span>
                    <span>
                        <strong>{interviewingApplications}</strong>
                        <small>Interviewing</small>
                    </span>
                </div>
                <button
                    type="button"
                    className="secondary small goal-card-action"
                    onClick={onCreateApplication}
                >
                    <AppIcon name="plus" size={15} />
                    Add Application
                </button>
            </div>
        </section>
    );
}
