"use client";

import type { ResumeAnalytics } from "../../lib/types";
import { AppIcon } from "../AppIcon";
import { InfoTooltip } from "./InfoTooltip";

type ResumePerformanceTableProps = {
    analytics: ResumeAnalytics;
    error: string;
    isLoading: boolean;
    onRetry: () => void;
};

function formatRate(value: number) {
    return `${value}%`;
}

export function ResumePerformanceTable({
    analytics,
    error,
    isLoading,
    onRetry,
}: ResumePerformanceTableProps) {
    return (
        <section className="source-quality-panel resume-performance-panel" aria-labelledby="resume-performance-title">
            <div className="resume-performance-heading">
                <h2 id="resume-performance-title">
                    <span className="heading-icon"><AppIcon name="document" size={16} /></span>
                    Resume performance
                    <InfoTooltip
                        label="Resume performance information"
                        tooltip="Outcomes are grouped by the resume currently linked to each submitted application. Archived versions stay visible."
                    />
                </h2>
                <p>
                    Rates become comparison-ready after {analytics.minimumSampleSize} submitted applications.
                </p>
            </div>

            {isLoading ? (
                <div className="analytics-empty-panel" aria-label="Loading resume performance">
                    <span className="resume-analytics-loader" aria-hidden="true" />
                    <p>Calculating resume outcomes…</p>
                </div>
            ) : error ? (
                <div className="analytics-empty-panel" role="alert">
                    <h3>Resume performance is unavailable</h3>
                    <p>{error}</p>
                    <button type="button" className="secondary" onClick={onRetry}>Try again</button>
                </div>
            ) : analytics.rows.length ? (
                <div className="source-quality-table-wrap">
                    <table className="source-quality-table resume-performance-table">
                        <thead>
                            <tr>
                                <th scope="col">Resume</th>
                                <th scope="col">Submitted</th>
                                <th scope="col">Responses</th>
                                <th scope="col">Interviews</th>
                                <th scope="col">Offers</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analytics.rows.map((row) => (
                                <tr key={row.resumeVersionId ?? "no-resume"}>
                                    <th scope="row">
                                        <span className="resume-performance-name">
                                            {row.name}
                                            {row.archivedAt ? <em>Archived</em> : null}
                                        </span>
                                        <small>{row.targetRole ?? (row.isNoResume ? "Unassigned applications" : "No target role")}</small>
                                    </th>
                                    <td data-label="Submitted">
                                        <strong>{row.submittedApplications}</strong>
                                        <span>{row.eligibleForComparison ? "Comparison-ready" : `Need ${Math.max(0, analytics.minimumSampleSize - row.submittedApplications)} more`}</span>
                                    </td>
                                    <td data-label="Responses">
                                        <strong>{formatRate(row.responseRate)}</strong>
                                        <span>{row.responses} responses</span>
                                    </td>
                                    <td data-label="Interviews">
                                        <strong>{formatRate(row.interviewRate)}</strong>
                                        <span>{row.interviews} interviews</span>
                                    </td>
                                    <td data-label="Offers">
                                        <strong>{formatRate(row.offerRate)}</strong>
                                        <span>{row.offers} offers</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="analytics-empty-panel">
                    <span className="empty-illustration"><AppIcon name="document" size={31} /></span>
                    <h3>No resume outcomes yet</h3>
                    <p>Submit applications with a resume to see version-level results.</p>
                </div>
            )}
        </section>
    );
}
