"use client";

import { useMemo, useState } from "react";

import type {
    ActivityLog,
    Application,
    ApplicationFilters,
    ApplicationGoalSettings,
    Interview,
    Task,
} from "../lib/types";
import { AppIcon } from "./AppIcon";
import { DashboardShell } from "./DashboardShell";
import { DashboardHome } from "./dashboard/DashboardHome";

type PreviewData = {
    applications: Application[];
    historyByApp: Record<string, ActivityLog[]>;
    interviews: Interview[];
    tasks: Task[];
};

const DEFAULT_FILTERS: ApplicationFilters = {
    query: "",
    status: "",
    source: "",
    company: "",
    timeframe: "",
};

function relativeDate(days: number, hour = 12) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
}

function createPreviewData(): PreviewData {
    const applicationDefinitions = [
        {
            id: "preview-saved",
            title: "Product Designer",
            companyName: "Juniper Labs",
            status: "SAVED",
            source: "LinkedIn",
            daysAgo: 0,
        },
        {
            id: "preview-applied-a",
            title: "Senior Product Designer",
            companyName: "Northstar",
            status: "APPLIED",
            source: "Company Site",
            daysAgo: -1,
        },
        {
            id: "preview-applied-b",
            title: "Product Design Lead",
            companyName: "Brightside",
            status: "APPLIED",
            source: "Referrals",
            daysAgo: -3,
        },
        {
            id: "preview-interviewing-a",
            title: "Staff Product Designer",
            companyName: "Fieldwork",
            status: "INTERVIEWING",
            source: "LinkedIn",
            daysAgo: -5,
        },
        {
            id: "preview-interviewing-b",
            title: "Senior UX Designer",
            companyName: "Canopy",
            status: "INTERVIEWING",
            source: "Recruiter Outreach",
            daysAgo: -8,
        },
        {
            id: "preview-offer",
            title: "Founding Product Designer",
            companyName: "Evergreen",
            status: "OFFER",
            source: "Wellfound",
            daysAgo: -12,
        },
        {
            id: "preview-rejected",
            title: "Design Systems Lead",
            companyName: "Hearth",
            status: "REJECTED",
            source: "Indeed",
            daysAgo: -17,
        },
    ] as const;

    const applications: Application[] = applicationDefinitions.map((definition) => ({
        id: definition.id,
        title: definition.title,
        status: definition.status,
        source: definition.source,
        companyName: definition.companyName,
        createdAt: relativeDate(definition.daysAgo),
        sourceUrl: null,
        location: "Remote",
        salaryMin: null,
        salaryMax: null,
        description: null,
        notes: null,
        resumeVersionId: null,
        resumeVersion: null,
        dateApplied:
            definition.status === "SAVED"
                ? null
                : relativeDate(definition.daysAgo).slice(0, 10),
    }));

    function statusHistory(
        applicationId: string,
        transitions: Array<[string, string, number]>,
    ) {
        return transitions.map<ActivityLog>(([from, to, daysAgo], index) => ({
            id: `${applicationId}-history-${index}`,
            applicationId,
            type: "STATUS_CHANGED",
            message: `Moved from ${from.toLowerCase()} to ${to.toLowerCase()}`,
            metadata: { from, to },
            createdAt: relativeDate(daysAgo),
        }));
    }

    const historyByApp: Record<string, ActivityLog[]> = {
        "preview-interviewing-a": statusHistory("preview-interviewing-a", [
            ["APPLIED", "INTERVIEWING", -3],
        ]),
        "preview-interviewing-b": statusHistory("preview-interviewing-b", [
            ["APPLIED", "INTERVIEWING", -4],
        ]),
        "preview-offer": statusHistory("preview-offer", [
            ["APPLIED", "INTERVIEWING", -8],
            ["INTERVIEWING", "OFFER", -2],
        ]),
        "preview-rejected": statusHistory("preview-rejected", [
            ["APPLIED", "INTERVIEWING", -12],
            ["INTERVIEWING", "REJECTED", -6],
        ]),
    };

    const interviews: Interview[] = [
        {
            id: "preview-interview-1",
            applicationId: "preview-interviewing-a",
            type: "MANAGER",
            scheduledAt: relativeDate(1, 10),
            durationMinutes: 45,
            location: null,
            meetingUrl: null,
            interviewerName: "Maya Chen",
            notes: null,
            outcome: "SCHEDULED",
            applicationTitle: "Staff Product Designer",
            companyName: "Fieldwork",
            createdAt: relativeDate(-2),
            updatedAt: relativeDate(-2),
        },
        {
            id: "preview-interview-2",
            applicationId: "preview-interviewing-b",
            type: "PANEL",
            scheduledAt: relativeDate(3, 14),
            durationMinutes: 60,
            location: null,
            meetingUrl: null,
            interviewerName: "Design team",
            notes: null,
            outcome: "SCHEDULED",
            applicationTitle: "Senior UX Designer",
            companyName: "Canopy",
            createdAt: relativeDate(-1),
            updatedAt: relativeDate(-1),
        },
    ];

    const tasks: Task[] = [
        {
            id: "preview-task-1",
            applicationId: "preview-applied-a",
            title: "Follow up with recruiter",
            description: null,
            dueDate: relativeDate(0, 16),
            completedAt: null,
            type: "FOLLOW_UP",
            applicationTitle: "Senior Product Designer",
            companyName: "Northstar",
            createdAt: relativeDate(-2),
            updatedAt: relativeDate(-2),
        },
        {
            id: "preview-task-2",
            applicationId: "preview-interviewing-a",
            title: "Prepare portfolio walkthrough",
            description: null,
            dueDate: relativeDate(1, 9),
            completedAt: null,
            type: "PREP",
            applicationTitle: "Staff Product Designer",
            companyName: "Fieldwork",
            createdAt: relativeDate(-1),
            updatedAt: relativeDate(-1),
        },
    ];

    return { applications, historyByApp, interviews, tasks };
}

export function LandingDashboardPreview() {
    const previewData = useMemo(() => createPreviewData(), []);
    const [applications, setApplications] = useState(previewData.applications);
    const [applicationGoal, setApplicationGoal] =
        useState<ApplicationGoalSettings>({ target: 5, period: "weekly" });
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [openTimelineId, setOpenTimelineId] = useState<string | null>(null);

    return (
        <div className="dashboard-preview-page">
            <DashboardShell
                currentView="dashboard"
                firstName="Alex"
                isProfileMenuOpen={false}
                onCurrentViewChange={() => undefined}
                onImportOpen={() => undefined}
                onProfileMenuChange={() => undefined}
                onSignOut={() => undefined}
                topbarPageControls={
                    <>
                        <h1 className="topbar-page-title">Dashboard</h1>
                        <div className="topbar-page-actions">
                            <button type="button" className="primary" aria-label="Import job">
                                <AppIcon name="import" size={18} />
                                <span>Import Job</span>
                            </button>
                            <button type="button" className="secondary" aria-label="Add application">
                                <AppIcon name="plus" size={18} />
                                <span>Add Application</span>
                            </button>
                        </div>
                    </>
                }
            >
                <DashboardHome
                    applicationGoal={applicationGoal}
                    applications={applications}
                    filters={filters}
                    historyByApp={previewData.historyByApp}
                    interviews={previewData.interviews}
                    openTimelineId={openTimelineId}
                    tasks={previewData.tasks}
                    onApplicationGoalChange={setApplicationGoal}
                    onCreateInterview={() => undefined}
                    onCreateTask={() => undefined}
                    onFiltersChange={setFilters}
                    onRemoveApplication={(id) =>
                        setApplications((current) =>
                            current.filter((application) => application.id !== id),
                        )
                    }
                    onRemoveHistoryEvent={() => undefined}
                    onStartEdit={() => undefined}
                    onToggleTimeline={(id) =>
                        setOpenTimelineId((current) => (current === id ? null : id))
                    }
                    onTransitionStatus={(id, nextStatus) =>
                        setApplications((current) =>
                            current.map((application) =>
                                application.id === id
                                    ? { ...application, status: nextStatus }
                                    : application,
                            ),
                        )
                    }
                    onViewApplications={() => undefined}
                    onViewApplication={() => undefined}
                    onViewInterviews={() => undefined}
                    onViewTasks={() => undefined}
                />
            </DashboardShell>
        </div>
    );
}
