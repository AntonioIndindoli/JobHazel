"use client";

import { useMemo } from "react";

import {
    filterApplications,
    groupDashboardApplications,
} from "../../lib/application-analytics";
import type {
    ActivityLog,
    Application,
    ApplicationFilters,
    ApplicationGoalSettings,
    Interview,
    Task,
} from "../../lib/types";
import { ApplicationTracker } from "./ApplicationTracker";
import { DashboardStats } from "./DashboardStats";

type DashboardHomeProps = {
    applicationGoal: ApplicationGoalSettings;
    applications: Application[];
    filters: ApplicationFilters;
    historyByApp: Record<string, ActivityLog[]>;
    interviews: Interview[];
    openTimelineId: string | null;
    tasks: Task[];
    onApplicationGoalChange: (goal: ApplicationGoalSettings) => void;
    onCreateInterview: (applicationId?: string) => void;
    onCreateTask: () => void;
    onFiltersChange: (filters: ApplicationFilters) => void;
    onRemoveApplication: (id: string) => void;
    onRemoveHistoryEvent: (
        applicationId: string,
        activityLogId: string,
    ) => void | Promise<void>;
    onStartEdit: (application: Application) => void;
    onToggleTimeline: (id: string) => void | Promise<void>;
    onTransitionStatus: (id: string, nextStatus: string) => void | Promise<void>;
    onViewApplications: () => void;
    onViewApplication: (id: string) => void;
    onViewInterviews: () => void;
    onViewTasks: () => void;
};

export function DashboardHome({
    applicationGoal,
    applications,
    filters,
    historyByApp,
    interviews,
    openTimelineId,
    tasks,
    onApplicationGoalChange,
    onFiltersChange,
    onRemoveApplication,
    onRemoveHistoryEvent,
    onStartEdit,
    onToggleTimeline,
    onTransitionStatus,
    onViewApplication,
}: DashboardHomeProps) {
    const trackerApplications = useMemo(
        () => filterApplications(applications, filters),
        [applications, filters],
    );
    const groupedApplications = useMemo(
        () => groupDashboardApplications(trackerApplications),
        [trackerApplications],
    );
    const mobileGroupedApplications = useMemo(
        () =>
            groupDashboardApplications(
                filterApplications(applications, { ...filters, status: "" }),
            ),
        [applications, filters],
    );

    return (
        <>
            <DashboardStats
                applicationGoal={applicationGoal}
                applications={applications}
                historyByApp={historyByApp}
                interviews={interviews}
                onApplicationGoalChange={onApplicationGoalChange}
                tasks={tasks}
            />
            <ApplicationTracker
                applications={applications}
                filters={filters}
                groupedApplications={groupedApplications}
                mobileGroupedApplications={mobileGroupedApplications}
                historyByApp={historyByApp}
                interviews={interviews}
                openTimelineId={openTimelineId}
                trackerApplications={trackerApplications}
                onFiltersChange={onFiltersChange}
                onRemoveApplication={onRemoveApplication}
                onRemoveHistoryEvent={onRemoveHistoryEvent}
                onStartEdit={onStartEdit}
                onToggleTimeline={onToggleTimeline}
                onTransitionStatus={onTransitionStatus}
                onViewApplication={onViewApplication}
            />
        </>
    );
}
