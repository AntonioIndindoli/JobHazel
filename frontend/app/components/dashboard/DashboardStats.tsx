"use client";

import { useTaskTimeZone } from "../../lib/task-timezone";

import { useEffect, useState } from "react";

import {
    countActiveApplications,
    filterApplicationsByTimeframe,
    getApplicationTimestamp,
    getTimeframeStartTimestamp,
} from "../../lib/application-analytics";
import {
    APPLICATION_GOAL_PERIOD_OPTIONS,
    DASHBOARD_TIMEFRAME_OPTIONS,
} from "../../lib/constants";
import { hasRetainedMilestone } from "../../lib/dashboard-metrics";
import { AppIcon, MetricIcon } from "../AppIcon";
import { PipelineVisualization } from "./PipelineVisualization";
import { isUpcomingInterview } from "../../lib/interview-utils";
import { isTaskNeedingAttention } from "../../lib/task-utils";
import type {
    ActivityLog,
    Application,
    ApplicationGoalPeriod,
    ApplicationGoalSettings,
    AppIconName,
    DashboardTimeframe,
    IconTone,
    Interview,
    Task,
} from "../../lib/types";

const RESPONSE_STATUSES = new Set(["INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"]);
const INTERVIEW_STATUSES = new Set(["INTERVIEWING", "OFFER"]);
const GOAL_PERIOD_COPY: Record<
    ApplicationGoalPeriod,
    { ariaLabel: string; countLabel: string; title: string }
> = {
    daily: {
        ariaLabel: "Daily application goal progress",
        countLabel: "today",
        title: "Daily Application Goal",
    },
    weekly: {
        ariaLabel: "Weekly application goal progress",
        countLabel: "this week",
        title: "Weekly Application Goal",
    },
    monthly: {
        ariaLabel: "Monthly application goal progress",
        countLabel: "this month",
        title: "Monthly Application Goal",
    },
};

type DashboardStatsProps = {
    applicationGoal: ApplicationGoalSettings;
    applications: Application[];
    historyByApp: Record<string, ActivityLog[]>;
    interviews: Interview[];
    onApplicationGoalChange: (goal: ApplicationGoalSettings) => void;
    tasks: Task[];
};

type ApplicationGoalControlsProps = {
    applicationGoal: ApplicationGoalSettings;
    onApplicationGoalChange: (goal: ApplicationGoalSettings) => void;
};

function getPercent(value: number, total: number) {
    if (!total) return 0;
    return Math.round((value / total) * 100);
}

function getGoalTarget(target: number) {
    return Number.isFinite(target) ? Math.max(1, Math.floor(target)) : 1;
}

function getGoalPeriodRange(period: ApplicationGoalPeriod) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (period === "weekly") {
        start.setDate(start.getDate() - start.getDay());
    }

    if (period === "monthly") {
        start.setDate(1);
    }

    const end = new Date(start);
    if (period === "daily") end.setDate(start.getDate() + 1);
    if (period === "weekly") end.setDate(start.getDate() + 7);
    if (period === "monthly") end.setMonth(start.getMonth() + 1);

    return { end: end.getTime(), start: start.getTime() };
}

function ApplicationGoalControls({
    applicationGoal,
    onApplicationGoalChange,
}: ApplicationGoalControlsProps) {
    const goalTarget = getGoalTarget(applicationGoal.target);
    const [goalTargetDraft, setGoalTargetDraft] = useState(String(goalTarget));

    function updateGoalTarget(nextValue: string) {
        setGoalTargetDraft(nextValue);

        const parsedTarget = Number(nextValue);
        if (!Number.isFinite(parsedTarget) || parsedTarget < 1) return;

        onApplicationGoalChange({
            ...applicationGoal,
            target: Math.floor(parsedTarget),
        });
    }

    function commitGoalTarget() {
        const parsedTarget = Number(goalTargetDraft);
        if (!Number.isFinite(parsedTarget) || parsedTarget < 1) {
            setGoalTargetDraft(String(goalTarget));
            return;
        }

        const nextTarget = Math.floor(parsedTarget);
        setGoalTargetDraft(String(nextTarget));
        if (nextTarget === applicationGoal.target) return;

        onApplicationGoalChange({ ...applicationGoal, target: nextTarget });
    }

    function updateGoalPeriod(nextPeriod: ApplicationGoalPeriod) {
        onApplicationGoalChange({ ...applicationGoal, period: nextPeriod });
    }

    return (
        <div
            className="application-goal-controls"
            aria-label="Application goal controls"
        >
            <label className="application-goal-field">
                <span>Goal</span>
                <input
                    type="number"
                    min={1}
                    step={1}
                    value={goalTargetDraft}
                    aria-label="Application goal target"
                    onBlur={commitGoalTarget}
                    onChange={(event) => updateGoalTarget(event.target.value)}
                />
            </label>
            <label className="application-goal-field">
                <span>Period</span>
                <select
                    value={applicationGoal.period}
                    aria-label="Application goal period"
                    onChange={(event) =>
                        updateGoalPeriod(event.target.value as ApplicationGoalPeriod)
                    }
                >
                    {APPLICATION_GOAL_PERIOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}

export function DashboardStats({
    applicationGoal,
    applications,
    historyByApp,
    interviews,
    onApplicationGoalChange,
    tasks,
}: DashboardStatsProps) {
    const { timeZone } = useTaskTimeZone();
    const [isGoalEditorOpen, setIsGoalEditorOpen] = useState(false);
    const [statsTimeframe, setStatsTimeframe] =
        useState<DashboardTimeframe>("");

    useEffect(() => {
        const compactDashboardQuery = window.matchMedia("(max-width: 1600px)");

        function resetCompactTimeframe(event: MediaQueryListEvent | MediaQueryList) {
            if (event.matches) setStatsTimeframe("");
        }

        resetCompactTimeframe(compactDashboardQuery);
        compactDashboardQuery.addEventListener("change", resetCompactTimeframe);

        return () =>
            compactDashboardQuery.removeEventListener(
                "change",
                resetCompactTimeframe,
            );
    }, []);

    const now = new Date();
    const statsApplications = filterApplicationsByTimeframe(
        applications,
        statsTimeframe,
        now,
    );
    const statsApplicationIds = new Set(
        statsApplications.map((application) => application.id),
    );
    const timeframeStart = getTimeframeStartTimestamp(statsTimeframe, now);
    const statsInterviews = statsTimeframe
        ? interviews.filter((interview) =>
              statsApplicationIds.has(interview.applicationId),
          )
        : interviews;
    const statsTasks = statsTimeframe
        ? tasks.filter((task) => {
              if (task.applicationId) {
                  return statsApplicationIds.has(task.applicationId);
              }

              const createdAt = new Date(task.createdAt).getTime();
              return (
                  timeframeStart !== null &&
                  createdAt >= timeframeStart &&
                  createdAt <= now.getTime()
              );
          })
        : tasks;
    const activeApplicationCount = countActiveApplications(statsApplications);
    const upcomingInterviewCount = statsInterviews.filter(
        isUpcomingInterview,
    ).length;
    const dueTaskCount = statsTasks.filter((task) => isTaskNeedingAttention(task, timeZone)).length;
    const responseCount = statsApplications.filter(
        (application) => RESPONSE_STATUSES.has(application.status),
    ).length;
    const submittedApplications = statsApplications.filter(
        (application) => application.status !== "SAVED",
    );
    const interviewCount = submittedApplications.filter(
        (application) =>
            hasRetainedMilestone(
                application,
                historyByApp[application.id] ?? [],
                INTERVIEW_STATUSES,
            ),
    ).length;
    const responseRate = getPercent(responseCount, statsApplications.length);
    const interviewRate = getPercent(
        interviewCount,
        submittedApplications.length,
    );
    const goalPeriodRange = getGoalPeriodRange(applicationGoal.period);
    const goalTarget = getGoalTarget(applicationGoal.target);
    const goalApplications = applications.filter((application) => {
        const applicationTime = getApplicationTimestamp(application);
        return (
            applicationTime >= goalPeriodRange.start &&
            applicationTime < goalPeriodRange.end
        );
    }).length;
    const goalProgress = Math.min(
        100,
        getPercent(goalApplications, goalTarget),
    );
    const goalCopy = GOAL_PERIOD_COPY[applicationGoal.period];
    const stats: Array<{
        label: string;
        value: string | number;
        icon: AppIconName;
        tone?: IconTone;
        detail?: string;
    }> = [
            {
                label: "Total Applications",
                value: statsApplications.length,
                icon: "applications",
                tone: "green",
            },
            {
                label: "Active Applications",
                value: activeApplicationCount,
                icon: "trend",
                tone: "green",
            },
            {
                label: "Response Rate",
                value: `${responseRate}%`,
                icon: "clock",
            },
            {
                label: "Interview Rate",
                value: `${interviewRate}%`,
                icon: "contacts",
                tone: "purple",
            },
            {
                label: "Interviews Scheduled",
                value: upcomingInterviewCount,
                icon: "calendar",
                tone: "orange",
            },
            {
                label: "Tasks & Follow-ups Due",
                value: dueTaskCount,
                icon: "checklist",
            },
        ];

    return (
        <section className="pipeline-stats-container">
            <PipelineVisualization
                applications={applications}
                historyByApp={historyByApp}
            />
            <div className="stats-summary-panel">
                <section className="stats-panel" aria-labelledby="stats-heading">
                    <div className="stats-panel-header">
                        <h2 id="stats-heading">Job Search Stats</h2>
                        <select
                            className="stats-timeframe-filter"
                            aria-label="Filter job search stats by timeframe"
                            value={statsTimeframe}
                            onChange={(event) =>
                                setStatsTimeframe(
                                    event.target.value as DashboardTimeframe,
                                )
                            }
                        >
                            {DASHBOARD_TIMEFRAME_OPTIONS.map((option) => (
                                <option
                                    key={option.value || "all-time"}
                                    value={option.value}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="stat-grid">
                        {stats.map((stat) => (
                            <article className="stat-card" key={stat.label}>
                                <MetricIcon name={stat.icon} tone={stat.tone} />
                                <div>
                                    <p>{stat.label}</p>
                                    <strong>{stat.value}</strong>
                                    {stat.detail && (
                                        <small className="stat-detail">{stat.detail}</small>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
                <footer className="weekly-goal-summary">
                    <div className="weekly-goal-header">
                        <h3>{goalCopy.title}</h3>
                        <button
                            type="button"
                            className="goal-edit-button"
                            aria-label="Edit application goal"
                            aria-expanded={isGoalEditorOpen}
                            onClick={() => setIsGoalEditorOpen((isOpen) => !isOpen)}
                        >
                            <AppIcon name="edit" size={16} />
                        </button>
                    </div>
                    {isGoalEditorOpen && (
                        <ApplicationGoalControls
                            applicationGoal={applicationGoal}
                            onApplicationGoalChange={onApplicationGoalChange}
                        />
                    )}
                    <div className="weekly-goal-copy">
                        <span>
                            {goalApplications} of {goalTarget} applications{" "}
                            {goalCopy.countLabel}
                        </span>
                        <strong>{goalProgress}% complete</strong>
                    </div>
                    <div
                        className="weekly-goal-bar"
                        role="progressbar"
                        aria-label={goalCopy.ariaLabel}
                        aria-valuemin={0}
                        aria-valuemax={goalTarget}
                        aria-valuenow={Math.min(goalApplications, goalTarget)}
                    >
                        <span style={{ width: `${goalProgress}%` }} />
                    </div>
                </footer>
            </div>
        </section>
    );
}
