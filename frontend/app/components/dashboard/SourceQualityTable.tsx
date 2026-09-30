"use client";

import { useMemo } from "react";

import {
    buildSourceQualityRows,
    formatDaysToResponse,
} from "../../lib/application-analytics";
import type { ActivityLog, Application, Interview } from "../../lib/types";
import { AppIcon } from "../AppIcon";
import { InfoTooltip } from "./InfoTooltip";

type SourceQualityTableProps = {
    applications: Application[];
    historyByApp: Record<string, ActivityLog[]>;
    interviews: Interview[];
};

function formatRate(value: number) {
    return `${value}%`;
}

export function SourceQualityTable({
    applications,
    historyByApp,
    interviews,
}: SourceQualityTableProps) {
    const rows = useMemo(
        () => buildSourceQualityRows(applications, historyByApp, interviews),
        [applications, historyByApp, interviews],
    );

    return (
        <div className="source-quality-panel">
            <h2>
                <span className="heading-icon">
                    <AppIcon name="analytics" size={16} />
                </span>
                Source Quality
                <InfoTooltip
                    label="Source quality information"
                    tooltip="Responses include interviews, offers, and rejections; withdrawal alone does not count. Response speed uses recorded response events with a known application date."
                />
            </h2>

            {rows.length > 0 ? (
                <div className="source-quality-table-wrap">
                    <table className="source-quality-table">
                        <thead>
                            <tr>
                                <th scope="col">Source</th>
                                <th scope="col">Applications</th>
                                <th scope="col">Response rate</th>
                                <th scope="col">Interview rate</th>
                                <th scope="col">Offers</th>
                                <th scope="col">Avg. days to response</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.source}>
                                    <th scope="row">
                                        <span className="source-quality-source">
                                            <b />
                                            {row.source}
                                        </span>
                                    </th>
                                    <td data-label="Applications">
                                        <strong>{row.applications}</strong>
                                        <span>
                                            {row.submittedApplications} submitted
                                        </span>
                                    </td>
                                    <td data-label="Response rate">
                                        <strong>{formatRate(row.responseRate)}</strong>
                                        <span>
                                            {row.responses} of{" "}
                                            {row.submittedApplications} submitted
                                        </span>
                                    </td>
                                    <td data-label="Interview rate">
                                        <strong>{formatRate(row.interviewRate)}</strong>
                                        <span>{row.interviews} interviews</span>
                                    </td>
                                    <td data-label="Offers">
                                        <strong>{row.offers}</strong>
                                        <span>
                                            {row.offers === 1 ? "offer" : "offers"}
                                        </span>
                                    </td>
                                    <td data-label="Avg. days to response">
                                        <strong>
                                            {formatDaysToResponse(
                                                row.averageDaysToResponse,
                                            )}
                                        </strong>
                                        <span>
                                            {row.averageDaysToResponse !== null
                                                ? "from recorded responses"
                                                : row.responses ? "timing unavailable" : "no responses yet"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="analytics-empty-panel">
                    <span className="empty-illustration">
                        <AppIcon name="source" size={31} />
                    </span>
                    <h3>No source quality yet</h3>
                    <p>Add applications with sources to compare channel quality.</p>
                </div>
            )}
        </div>
    );
}
