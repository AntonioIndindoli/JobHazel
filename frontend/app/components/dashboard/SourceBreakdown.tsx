"use client";

import { SOURCES, SOURCE_DOTS } from "../../lib/constants";
import { normalizeSource } from "../../lib/application-analytics";
import type { Application } from "../../lib/types";
import { AppIcon } from "../AppIcon";
import { InfoTooltip } from "./InfoTooltip";

type SourceBreakdownProps = {
    applications: Application[];
};

const OTHER_SOURCE = "Other";
const OTHER_SOURCE_COLOR = "#64748b";
const SOURCE_COLORS = [...SOURCE_DOTS, OTHER_SOURCE_COLOR];
const BREAKDOWN_SOURCES = [...SOURCES, OTHER_SOURCE];

export function SourceBreakdown({ applications }: SourceBreakdownProps) {
    const sourceLookup = new Map(SOURCES.map((source) => [source.toLowerCase(), source]));
    const sourceCounts = new Map(BREAKDOWN_SOURCES.map((source) => [source, 0]));

    applications.forEach((app) => {
        const normalizedSource = normalizeSource(app.source);
        const source = normalizedSource
            ? sourceLookup.get(normalizedSource.toLowerCase()) ?? OTHER_SOURCE
            : OTHER_SOURCE;
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    });

    const sourceRows = BREAKDOWN_SOURCES.map((source, index) => ({
        source,
        color: SOURCE_COLORS[index],
        count: sourceCounts.get(source) ?? 0,
    })).filter((row) => row.count > 0);

    const totalSourceCount = sourceRows.reduce((sum, row) => sum + row.count, 0);
    const sourceSegments = sourceRows.map((row, index) => {
        const start = sourceRows
            .slice(0, index)
            .reduce((sum, sourceRow) => sum + sourceRow.count, 0);
        const end = start + row.count;
        return {
            ...row,
            startPercent: totalSourceCount ? (start / totalSourceCount) * 100 : 0,
            endPercent: totalSourceCount ? (end / totalSourceCount) * 100 : 0,
            percentage: totalSourceCount
                ? Math.round((row.count / totalSourceCount) * 100)
                : 0,
        };
    });

    return (
        <div className="sources">
            <h2>
                <span className="heading-icon">
                    <AppIcon name="source" size={16} />
                </span>
                Application Sources
                <InfoTooltip
                    label="Application sources information"
                    tooltip="Shows where your applications came from based on each saved source."
                />
            </h2>
            <div className="sources-chart">
                <div
                    className={`donut${totalSourceCount ? " has-data" : ""}`}
                    aria-label={`${totalSourceCount} applications by source`}
                >
                    <strong>{totalSourceCount}</strong>
                    <span>{totalSourceCount === 1 ? "source" : "sources"}</span>
                </div>
                <div className="source-list">
                    {sourceSegments.map((segment) => (
                        <span key={segment.source}>
                            <b style={{ background: segment.color }} />
                            {segment.source}
                            <em>
                                {segment.count} ({segment.percentage}%)
                            </em>
                        </span>
                    ))}
                </div>
            </div>
            {totalSourceCount
                ? undefined
                : <p>Import jobs or add sources to see your source breakdown.</p>}
        </div>
    );
}
