"use client";

import { useMemo } from "react";

import {
    buildAnalyticsKpiCards,
} from "../lib/application-analytics";
import type { AnalyticsTimeframeDays } from "../lib/application-analytics";
import type {
    ActivityLog,
    Application,
    Interview,
    ResumeAnalytics,
    WeeklyRangeWeeks,
} from "../lib/types";
import { MetricIcon } from "./AppIcon";
import { ApplicationMap } from "./dashboard/ApplicationMap";
import { SourceBreakdown } from "./dashboard/SourceBreakdown";
import { SourceQualityTable } from "./dashboard/SourceQualityTable";
import { ResumePerformanceTable } from "./dashboard/ResumePerformanceTable";
import { WeeklyApplications } from "./dashboard/WeeklyApplications";

type AnalyticsViewProps = {
    applications: Application[];
    historyByApp: Record<string, ActivityLog[]>;
    interviews: Interview[];
    resumeAnalytics: ResumeAnalytics;
    resumeAnalyticsError: string;
    isResumeAnalyticsLoading: boolean;
    kpiTimeframeDays: AnalyticsTimeframeDays;
    weeklyRangeWeeks: WeeklyRangeWeeks;
    onViewApplication: (applicationId: string) => void;
    onResumeAnalyticsRetry: () => void;
    onWeeklyRangeChange: (weeks: WeeklyRangeWeeks) => void;
};

export function AnalyticsView({
    applications,
    historyByApp,
    interviews,
    resumeAnalytics,
    resumeAnalyticsError,
    isResumeAnalyticsLoading,
    kpiTimeframeDays,
    weeklyRangeWeeks,
    onViewApplication,
    onResumeAnalyticsRetry,
    onWeeklyRangeChange,
}: AnalyticsViewProps) {
    const kpiCards = useMemo(
        () =>
            buildAnalyticsKpiCards(
                applications,
                historyByApp,
                interviews,
                kpiTimeframeDays,
            ),
        [applications, historyByApp, interviews, kpiTimeframeDays],
    );

    return (
        <section className="applications-page analytics-page">
            <section className="analytics-kpi-section" aria-labelledby="analytics-kpi-title">
                <div className="analytics-kpi-grid">
                    {kpiCards.map((card) => (
                        <article className="analytics-kpi-card" key={card.label}>
                            <div>
                                <p>{card.label}</p>
                                <strong>{card.value}</strong>
                                <span>{card.comparison}</span>
                            </div>
                            <MetricIcon name={card.icon} tone={card.tone} />
                        </article>
                    ))}
                </div>
            </section>

            <section className="analytics-page-grid">
                <ResumePerformanceTable
                    analytics={resumeAnalytics}
                    error={resumeAnalyticsError}
                    isLoading={isResumeAnalyticsLoading}
                    onRetry={onResumeAnalyticsRetry}
                />
                <SourceQualityTable
                    applications={applications}
                    historyByApp={historyByApp}
                    interviews={interviews}
                />
                <ApplicationMap
                    applications={applications}
                    onViewApplication={onViewApplication}
                />
                <SourceBreakdown applications={applications} />
                <WeeklyApplications
                    applications={applications}
                    weeklyRangeWeeks={weeklyRangeWeeks}
                    onWeeklyRangeChange={onWeeklyRangeChange}
                />
            </section>
        </section>
    );
}
