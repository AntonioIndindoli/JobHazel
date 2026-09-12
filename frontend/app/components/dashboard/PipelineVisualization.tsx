"use client";

import {
    sankey,
    sankeyLinkHorizontal,
    type SankeyGraph,
    type SankeyLink,
    type SankeyNode,
} from "d3-sankey";
import { useEffect, useMemo, useState } from "react";

import {
    buildApplicationPipelinePath,
    countApplicationsByStatus,
    getApplicationTimestamp,
    type ApplicationPipelineNode,
} from "../../lib/application-analytics";
import { APPLICATION_STATUS_COLORS } from "../../lib/constants";
import type { ActivityLog, Application } from "../../lib/types";

type PipelineNodeId = ApplicationPipelineNode;

type PipelineNodeDatum = {
    id: string;
    label: string;
    color: string;
    column: number;
    order: number;
    isRoutingNode?: boolean;
};

type PipelineLinkDatum = {
    color: string;
    label: string;
};

type PipelineGraph = SankeyGraph<PipelineNodeDatum, PipelineLinkDatum>;

type SankeySize = {
    width: number;
    height: number;
};

type VisualizationKind = "sankey" | "bar" | "line";

type TimelineRange = "6-weeks" | "6-months";

type TimelineDatum = {
    id: string;
    label: string;
    accessibleLabel: string;
    color: string;
    value: number;
};

const PIPELINE_NODE_ORDER: PipelineNodeId[] = [
    "APPLIED",
    "INTERVIEWING",
    "NO_RESPONSE",
    "OFFER",
    "REJECTED",
    "WITHDRAWN",
];

const NODE_COLUMN: Record<PipelineNodeId, number> = {
    APPLIED: 0,
    INTERVIEWING: 1,
    NO_RESPONSE: 2,
    OFFER: 2,
    REJECTED: 2,
    WITHDRAWN: 2,
};

const NODE_ORDER: Record<PipelineNodeId, number> = {
    APPLIED: 0,
    INTERVIEWING: 0,
    OFFER: 0,
    REJECTED: 1,
    WITHDRAWN: 2,
    NO_RESPONSE: 3,
};

const NODE_CATALOG: Record<PipelineNodeId, PipelineNodeDatum> = {
    APPLIED: {
        id: "APPLIED",
        label: "Applied",
        color: APPLICATION_STATUS_COLORS.APPLIED,
        column: NODE_COLUMN.APPLIED,
        order: NODE_ORDER.APPLIED,
    },
    INTERVIEWING: {
        id: "INTERVIEWING",
        label: "Interview",
        color: APPLICATION_STATUS_COLORS.INTERVIEWING,
        column: NODE_COLUMN.INTERVIEWING,
        order: NODE_ORDER.INTERVIEWING,
    },
    NO_RESPONSE: {
        id: "NO_RESPONSE",
        label: "No Response",
        color: APPLICATION_STATUS_COLORS.APPLIED,
        column: NODE_COLUMN.NO_RESPONSE,
        order: NODE_ORDER.NO_RESPONSE,
    },
    OFFER: {
        id: "OFFER",
        label: "Offer",
        color: APPLICATION_STATUS_COLORS.OFFER,
        column: NODE_COLUMN.OFFER,
        order: NODE_ORDER.OFFER,
    },
    REJECTED: {
        id: "REJECTED",
        label: "Rejected",
        color: APPLICATION_STATUS_COLORS.REJECTED,
        column: NODE_COLUMN.REJECTED,
        order: NODE_ORDER.REJECTED,
    },
    WITHDRAWN: {
        id: "WITHDRAWN",
        label: "Withdrawn",
        color: APPLICATION_STATUS_COLORS.WITHDRAWN,
        column: NODE_COLUMN.WITHDRAWN,
        order: NODE_ORDER.WITHDRAWN,
    },
};

const LINK_COLORS: Record<PipelineNodeId, string> = {
    APPLIED: APPLICATION_STATUS_COLORS.APPLIED,
    INTERVIEWING: APPLICATION_STATUS_COLORS.INTERVIEWING,
    NO_RESPONSE: APPLICATION_STATUS_COLORS.APPLIED,
    OFFER: APPLICATION_STATUS_COLORS.OFFER,
    REJECTED: APPLICATION_STATUS_COLORS.REJECTED,
    WITHDRAWN: APPLICATION_STATUS_COLORS.WITHDRAWN,
};

const ALLOWED_TRANSITIONS: Record<PipelineNodeId, PipelineNodeId[]> = {
    APPLIED: ["INTERVIEWING", "NO_RESPONSE", "REJECTED", "WITHDRAWN"],
    INTERVIEWING: ["OFFER", "REJECTED", "WITHDRAWN"],
    OFFER: [],
    REJECTED: [],
    WITHDRAWN: [],
    NO_RESPONSE: [],
};

const SANKEY_MARGIN = {
    top: 24,
    right: 28,
    bottom: 44,
    left: 28,
} as const;
const SANKEY_NODE_PADDING_MIN = 32;
const SANKEY_NODE_PADDING_MAX = 72;
const SANKEY_NODE_WIDTH = 8;
const SANKEY_LINK_CLEARANCE = 8;

const VISUALIZATION_OPTIONS: Array<{
    value: VisualizationKind;
    label: string;
    accessibleLabel: string;
}> = [
    { value: "sankey", label: "Sankey", accessibleLabel: "Sankey diagram" },
    { value: "bar", label: "Bar", accessibleLabel: "Bar graph" },
    { value: "line", label: "Line", accessibleLabel: "Line graph" },
];

const TIMELINE_RANGE_OPTIONS: Array<{
    value: TimelineRange;
    label: string;
}> = [
    { value: "6-weeks", label: "Past 6 weeks" },
    { value: "6-months", label: "Past 6 months" },
];

const CHART_MARGIN = {
    top: 28,
    right: 20,
    bottom: 54,
    left: 42,
} as const;

function canAddLink(source: PipelineNodeId, target: PipelineNodeId) {
    return ALLOWED_TRANSITIONS[source].includes(target);
}

function spreadSankeyNodes(
    graph: PipelineGraph,
    top: number,
    bottom: number,
) {
    const columns = new Map<
        number,
        SankeyNode<PipelineNodeDatum, PipelineLinkDatum>[]
    >();

    for (const node of graph.nodes) {
        // Group by the actual column configuration, not node.depth.
        const columnId = node.column;

        const column = columns.get(columnId) ?? [];
        column.push(node);
        columns.set(columnId, column);
    }

    for (const nodes of columns.values()) {
        nodes.sort(compareNodes);

        const heights = nodes.map(
            (node) => Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0)),
        );

        const totalNodeHeight = heights.reduce(
            (sum, height) => sum + height,
            0,
        );

        const columnHeight = bottom - top;

        if (nodes.length === 1) {
            const node = nodes[0];
            const height = heights[0];

            // Leave room for direct links that are ordered above this
            // intermediate node. Otherwise those links are drawn through it.
            const incomingClearance = (node.targetLinks ?? []).reduce(
                (largestClearance, incomingLink) => {
                    if (typeof incomingLink.source !== "object") {
                        return largestClearance;
                    }

                    const precedingLinkWidth = (
                        incomingLink.source.sourceLinks ?? []
                    )
                        .filter(
                            (sourceLink) =>
                                compareLinks(sourceLink, incomingLink) < 0,
                        )
                        .reduce(
                            (total, sourceLink) =>
                                total + Math.max(1, sourceLink.width ?? 1),
                            0,
                        );

                    return Math.max(largestClearance, precedingLinkWidth);
                },
                0,
            );

            const y = Math.min(
                bottom - height,
                top +
                    incomingClearance +
                    (incomingClearance ? SANKEY_LINK_CLEARANCE : 0),
            );

            node.y0 = y;
            node.y1 = y + height;
            continue;
        }

        const availableGapSpace = Math.max(
            0,
            columnHeight - totalNodeHeight,
        );

        const gap = availableGapSpace / (nodes.length - 1);

        let currentY = top;

        nodes.forEach((node, index) => {
            const height = heights[index];

            node.y0 = currentY;
            node.y1 = currentY + height;

            currentY += height + gap;
        });
    }
}

function getSankeyEndId(
    end: string | number | SankeyNode<PipelineNodeDatum, PipelineLinkDatum>,
) {
    return typeof end === "object" ? end.id : String(end);
}

function compareNodes(
    first: SankeyNode<PipelineNodeDatum, PipelineLinkDatum>,
    second: SankeyNode<PipelineNodeDatum, PipelineLinkDatum>,
) {
    return first.order - second.order;
}

function getSankeyEndOrder(
    end: string | number | SankeyNode<PipelineNodeDatum, PipelineLinkDatum>,
) {
    return typeof end === "object" ? end.order : 0;
}

function compareLinks(
    first: SankeyLink<PipelineNodeDatum, PipelineLinkDatum>,
    second: SankeyLink<PipelineNodeDatum, PipelineLinkDatum>,
) {
    const targetOrderDifference =
        getSankeyEndOrder(first.target) - getSankeyEndOrder(second.target);
    if (targetOrderDifference !== 0) return targetOrderDifference;
    return getSankeyEndOrder(first.source) - getSankeyEndOrder(second.source);
}

function buildPipelineSankey(
    applications: Application[],
    historyByApp: Record<string, ActivityLog[]>,
    size: SankeySize | null,
) {
    const counts = countApplicationsByStatus(applications);
    const total =
        counts.APPLIED +
        counts.INTERVIEWING +
        counts.OFFER +
        counts.REJECTED +
        counts.WITHDRAWN;
    if (!total || !size) {
        return { counts, total, graph: null, offerRate: 0, exitCount: 0 };
    }

    const layoutWidth = Math.max(
        size.width,
        SANKEY_MARGIN.left + SANKEY_MARGIN.right + SANKEY_NODE_WIDTH,
    );
    const layoutHeight = Math.max(
        size.height,
        SANKEY_MARGIN.top + SANKEY_MARGIN.bottom + 1,
    );

    const exitCount = counts.REJECTED + counts.WITHDRAWN;
    const linkTotals = new Map<
        string,
        { source: PipelineNodeId; target: PipelineNodeId; value: number }
    >();
    const usedNodeIds = new Set<PipelineNodeId>();

    const addLink = (source: PipelineNodeId, target: PipelineNodeId) => {
        if (!canAddLink(source, target)) return;
        usedNodeIds.add(source);
        usedNodeIds.add(target);

        const key = `${source}->${target}`;
        const existing = linkTotals.get(key);
        if (existing) existing.value += 1;
        else linkTotals.set(key, { source, target, value: 1 });
    };

    applications.forEach((application) => {
        const path = buildApplicationPipelinePath(
            application,
            historyByApp[application.id] ?? [],
        );
        path.forEach((node, index) => {
            const nextNode = path[index + 1];
            if (nextNode) addLink(node, nextNode);
        });
    });

    const routingNodes: PipelineNodeDatum[] = [];
    const rawLinks: Array<SankeyLink<PipelineNodeDatum, PipelineLinkDatum>> = [];

    for (const { source, target, value } of linkTotals.values()) {
        const color = LINK_COLORS[target];
        const label = `${NODE_CATALOG[source].label} to ${NODE_CATALOG[target].label}`;
        const crossesColumn = NODE_COLUMN[target] - NODE_COLUMN[source] > 1;

        if (!crossesColumn) {
            rawLinks.push({ source, target, value, color, label });
            continue;
        }

        // Sankey links that skip a layer can pass through nodes in that layer.
        // Insert a zero-width routing node so every edge advances one column at
        // a time and participates in the layout's collision avoidance.
        const routingNodeId = `ROUTE:${source}:${target}`;
        routingNodes.push({
            id: routingNodeId,
            label: "",
            color,
            column: NODE_COLUMN[source] + 1,
            order: NODE_ORDER[target],
            isRoutingNode: true,
        });
        rawLinks.push(
            { source, target: routingNodeId, value, color, label },
            { source: routingNodeId, target, value, color, label },
        );
    }

    const graphInput: PipelineGraph = {
        nodes: PIPELINE_NODE_ORDER.map((nodeId) => NODE_CATALOG[nodeId])
            .filter((node) => usedNodeIds.has(node.id as PipelineNodeId))
            .map((node) => ({ ...node }))
            .concat(routingNodes),
        links: rawLinks.map((link) => ({ ...link })),
    };

    if (!graphInput.links.length) {
        const node = graphInput.nodes[0];
        const y0 = SANKEY_MARGIN.top;
        const y1 = layoutHeight - SANKEY_MARGIN.bottom;
        return {
            counts,
            total,
            graph: {
                nodes: [
                    {
                        ...node,
                        index: 0,
                        depth: 0,
                        height: 0,
                        value: total,
                        x0: SANKEY_MARGIN.left,
                        x1: SANKEY_MARGIN.left + SANKEY_NODE_WIDTH,
                        y0,
                        y1,
                    },
                ],
                links: [],
            },
            offerRate: Math.round((counts.OFFER / Math.max(total, 1)) * 100),
            exitCount,
        };
    }

    const layoutTop = SANKEY_MARGIN.top;
    const layoutBottom = layoutHeight - SANKEY_MARGIN.bottom;
    const nodePadding = Math.max(
        SANKEY_NODE_PADDING_MIN,
        Math.min(SANKEY_NODE_PADDING_MAX, layoutHeight * 0.16),
    );

    const sankeyGenerator =
        sankey<PipelineNodeDatum, PipelineLinkDatum>()
            .nodeId((node) => node.id)
            .nodeWidth(SANKEY_NODE_WIDTH)
            .nodePadding(nodePadding)
            .nodeAlign((node, columns) =>
                Math.min(node.column, columns - 1)
            )
            .nodeSort(compareNodes)
            .linkSort(compareLinks)
            .iterations(64)
            .extent([
                [SANKEY_MARGIN.left, layoutTop],
                [layoutWidth - SANKEY_MARGIN.right, layoutBottom],
            ]);

    const graph = sankeyGenerator(graphInput);

    // Move nodes apart vertically.
    spreadSankeyNodes(graph, layoutTop, layoutBottom);

    // Routing nodes affect vertical layout but should not appear as an extra
    // stage. Collapse them horizontally so their two link segments join.
    graph.nodes.forEach((node) => {
        if (!node.isRoutingNode) return;
        const midpoint = ((node.x0 ?? 0) + (node.x1 ?? 0)) / 2;
        node.x0 = midpoint;
        node.x1 = midpoint;
    });

    // Recalculate where the links connect after moving the nodes.
    sankeyGenerator.update(graph);

    return {
        counts,
        total,
        graph,
        offerRate: Math.round((counts.OFFER / Math.max(total, 1)) * 100),
        exitCount,
    };
}

function getStartOfWeek(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
}

function buildApplicationTimeline(
    applications: Application[],
    range: TimelineRange,
    now = new Date(),
) {
    const isWeekly = range === "6-weeks";
    const currentPeriodStart = isWeekly
        ? getStartOfWeek(now)
        : new Date(now.getFullYear(), now.getMonth(), 1);
    const segments = Array.from({ length: 6 }, (_, index) => {
        const periodsAgo = 5 - index;
        const start = isWeekly
            ? new Date(currentPeriodStart)
            : new Date(
                currentPeriodStart.getFullYear(),
                currentPeriodStart.getMonth() - periodsAgo,
                1,
            );

        if (isWeekly) {
            start.setDate(currentPeriodStart.getDate() - periodsAgo * 7);
        }

        const end = isWeekly
            ? new Date(start)
            : new Date(start.getFullYear(), start.getMonth() + 1, 1);

        if (isWeekly) end.setDate(start.getDate() + 7);

        return {
            id: start.toISOString(),
            start: start.getTime(),
            end: end.getTime(),
            label: start.toLocaleDateString(undefined, isWeekly
                ? { month: "short", day: "numeric" }
                : { month: "short" }),
            accessibleLabel: start.toLocaleDateString(undefined, isWeekly
                ? { month: "long", day: "numeric", year: "numeric" }
                : { month: "long", year: "numeric" }),
            color: "var(--green)",
            value: 0,
        };
    });

    applications.forEach((application) => {
        if (application.status === "SAVED") return;

        const timestamp = getApplicationTimestamp(application);
        const segment = segments.find(
            ({ start, end }) => timestamp >= start && timestamp < end,
        );
        if (segment) segment.value += 1;
    });

    return segments satisfies TimelineDatum[];
}

function getNiceChartMaximum(value: number) {
    if (value <= 4) return 4;

    const roughStep = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalizedStep = roughStep / magnitude;
    const niceStep =
        normalizedStep <= 1
            ? 1
            : normalizedStep <= 2
                ? 2
                : normalizedStep <= 5
                    ? 5
                    : 10;

    return niceStep * magnitude * 4;
}

function getChartLayout(data: TimelineDatum[], size: SankeySize) {
    const plotWidth = Math.max(
        1,
        size.width - CHART_MARGIN.left - CHART_MARGIN.right,
    );
    const plotHeight = Math.max(
        1,
        size.height - CHART_MARGIN.top - CHART_MARGIN.bottom,
    );
    const chartMaximum = getNiceChartMaximum(
        Math.max(...data.map((stage) => stage.value), 0),
    );

    return {
        plotWidth,
        plotHeight,
        chartMaximum,
        slotWidth: plotWidth / data.length,
        baseline: CHART_MARGIN.top + plotHeight,
        yForValue: (value: number) =>
            CHART_MARGIN.top + plotHeight * (1 - value / chartMaximum),
    };
}

function VisualizationIcon({ type }: { type: VisualizationKind }) {
    if (type === "bar") {
        return (
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 13.5h11" />
                <rect x="3" y="7.5" width="2.25" height="4.5" rx=".5" />
                <rect x="6.9" y="3.5" width="2.25" height="8.5" rx=".5" />
                <rect x="10.75" y="5.5" width="2.25" height="6.5" rx=".5" />
            </svg>
        );
    }

    if (type === "line") {
        return (
            <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2.5 13.5h11M3.25 10.5 6.2 7.35l2.55 1.4L12.8 3.5" />
                <circle cx="3.25" cy="10.5" r=".8" />
                <circle cx="6.2" cy="7.35" r=".8" />
                <circle cx="8.75" cy="8.75" r=".8" />
                <circle cx="12.8" cy="3.5" r=".8" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 3.25h2.25v3H2.5zM11.25 2h2.25v3h-2.25zM11.25 10.75h2.25v3h-2.25zM4.75 4.75c3.5 0 3.25-1.25 6.5-1.25M4.75 4.75c3.5 0 3.25 7.5 6.5 7.5" />
        </svg>
    );
}

function ChartGrid({
    chartMaximum,
    plotWidth,
    plotHeight,
}: {
    chartMaximum: number;
    plotWidth: number;
    plotHeight: number;
}) {
    return (
        <g className="pipeline-chart-grid" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => {
                const ratio = index / 4;
                const value = Math.round(chartMaximum * (1 - ratio));
                const y = CHART_MARGIN.top + plotHeight * ratio;

                return (
                    <g key={value}>
                        <line
                            x1={CHART_MARGIN.left}
                            x2={CHART_MARGIN.left + plotWidth}
                            y1={y}
                            y2={y}
                        />
                        <text
                            x={CHART_MARGIN.left - 10}
                            y={y}
                            textAnchor="end"
                            dominantBaseline="middle"
                        >
                            {value}
                        </text>
                    </g>
                );
            })}
        </g>
    );
}

function PipelineBarChart({
    data,
    size,
    rangeLabel,
}: {
    data: TimelineDatum[];
    size: SankeySize;
    rangeLabel: string;
}) {
    const layout = getChartLayout(data, size);
    const barWidth = Math.min(48, layout.slotWidth * 0.58);

    return (
        <svg
            className="pipeline-chart-canvas"
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`Bar graph showing total applications by time segment for the ${rangeLabel.toLowerCase()}`}
            preserveAspectRatio="xMidYMid meet"
        >
            <ChartGrid {...layout} />
            <g className="pipeline-chart-series">
                {data.map((stage, index) => {
                    const x =
                        CHART_MARGIN.left +
                        layout.slotWidth * index +
                        (layout.slotWidth - barWidth) / 2;
                    const y = layout.yForValue(stage.value);
                    const height = Math.max(0, layout.baseline - y);
                    const labelX = x + barWidth / 2;

                    return (
                        <g key={stage.id} className="pipeline-bar">
                            <title>{`${stage.accessibleLabel}: ${stage.value} application${stage.value === 1 ? "" : "s"}`}</title>
                            <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={height}
                                rx="5"
                                fill={stage.color}
                            />
                            <text
                                className="pipeline-chart-value"
                                x={labelX}
                                y={Math.max(CHART_MARGIN.top + 10, y - 9)}
                                textAnchor="middle"
                            >
                                {stage.value}
                            </text>
                            <text
                                className="pipeline-chart-label"
                                x={labelX}
                                y={layout.baseline + 24}
                                textAnchor="middle"
                            >
                                {stage.label.split(" ").map((word, wordIndex) => (
                                    <tspan
                                        key={word}
                                        x={labelX}
                                        dy={wordIndex === 0 ? 0 : 12}
                                    >
                                        {word}
                                    </tspan>
                                ))}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
}

function PipelineLineChart({
    data,
    size,
    rangeLabel,
}: {
    data: TimelineDatum[];
    size: SankeySize;
    rangeLabel: string;
}) {
    const layout = getChartLayout(data, size);
    const points = data.map((stage, index) => ({
        ...stage,
        x: CHART_MARGIN.left + layout.slotWidth * (index + 0.5),
        y: layout.yForValue(stage.value),
    }));
    const path = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");

    return (
        <svg
            className="pipeline-chart-canvas"
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`Line graph showing total applications over the ${rangeLabel.toLowerCase()}`}
            preserveAspectRatio="xMidYMid meet"
        >
            <ChartGrid {...layout} />
            <path className="pipeline-line" d={path} />
            <g className="pipeline-chart-series">
                {points.map((point) => (
                    <g key={point.id} className="pipeline-line-point">
                        <title>{`${point.accessibleLabel}: ${point.value} application${point.value === 1 ? "" : "s"}`}</title>
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r="5"
                            fill={point.color}
                        />
                        <text
                            className="pipeline-chart-value"
                            x={point.x}
                            y={Math.max(CHART_MARGIN.top + 10, point.y - 12)}
                            textAnchor="middle"
                        >
                            {point.value}
                        </text>
                        <text
                            className="pipeline-chart-label"
                            x={point.x}
                            y={layout.baseline + 24}
                            textAnchor="middle"
                        >
                            {point.label.split(" ").map((word, wordIndex) => (
                                <tspan
                                    key={word}
                                    x={point.x}
                                    dy={wordIndex === 0 ? 0 : 12}
                                >
                                    {word}
                                </tspan>
                            ))}
                        </text>
                    </g>
                ))}
            </g>
        </svg>
    );
}

type PipelineVisualizationProps = {
    applications: Application[];
    historyByApp: Record<string, ActivityLog[]>;
};

export function PipelineVisualization({
    applications,
    historyByApp,
}: PipelineVisualizationProps) {
    const [visualization, setVisualization] =
        useState<VisualizationKind>("sankey");
    const [timelineRange, setTimelineRange] =
        useState<TimelineRange>("6-weeks");
    const [frameElement, setFrameElement] = useState<HTMLDivElement | null>(null);
    const [frameSize, setFrameSize] = useState<SankeySize | null>(null);

    useEffect(() => {
        if (!frameElement) return;

        let animationFrame = 0;

        const updateSize = (width: number, height: number) => {
            if (width <= 0 || height <= 0) return;

            cancelAnimationFrame(animationFrame);
            animationFrame = requestAnimationFrame(() => {
                const nextSize = {
                    width: Math.round(width),
                    height: Math.round(height),
                };

                setFrameSize((currentSize) =>
                    currentSize?.width === nextSize.width &&
                    currentSize.height === nextSize.height
                        ? currentSize
                        : nextSize,
                );
            });
        };

        updateSize(frameElement.clientWidth, frameElement.clientHeight);

        const resizeObserver = new ResizeObserver(([entry]) => {
            updateSize(entry.contentRect.width, entry.contentRect.height);
        });
        resizeObserver.observe(frameElement);

        return () => {
            cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
        };
    }, [frameElement]);

    const pipeline = useMemo(
        () => buildPipelineSankey(applications, historyByApp, frameSize),
        [applications, frameSize, historyByApp],
    );
    const timelineData = useMemo(
        () => buildApplicationTimeline(applications, timelineRange),
        [applications, timelineRange],
    );
    const timelineTotal = timelineData.reduce(
        (total, segment) => total + segment.value,
        0,
    );
    const timelineRangeOption =
        TIMELINE_RANGE_OPTIONS.find((option) => option.value === timelineRange) ??
        TIMELINE_RANGE_OPTIONS[0];
    const linkPath = useMemo(
        () => sankeyLinkHorizontal<PipelineNodeDatum, PipelineLinkDatum>(),
        [],
    );

    return (
        <section className="pipeline-graph" aria-labelledby="pipeline-heading">
            <header className="pipeline-header">
                <div>
                    <h2 id="pipeline-heading">
                        {visualization === "sankey"
                            ? "Application Flow"
                            : "Application Activity"}
                    </h2>
                </div>
                <div
                    className="pipeline-view-switcher"
                    role="group"
                    aria-label="Choose pipeline visualization"
                >
                    {VISUALIZATION_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={visualization === option.value}
                            aria-label={`Show ${option.accessibleLabel.toLowerCase()}`}
                            aria-controls="pipeline-visualization"
                            onClick={() => setVisualization(option.value)}
                        >
                            <VisualizationIcon type={option.value} />
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            </header>
            {visualization !== "sankey" ? (
                <div className="pipeline-timeline-toolbar">
                    <p aria-live="polite">
                        <strong>{timelineTotal}</strong>{" "}
                        application{timelineTotal === 1 ? "" : "s"}
                        <span> over the {timelineRangeOption.label.toLowerCase()}</span>
                    </p>
                    <label>
                        <span>Timeframe</span>
                        <select
                            value={timelineRange}
                            onChange={(event) =>
                                setTimelineRange(event.target.value as TimelineRange)
                            }
                        >
                            {TIMELINE_RANGE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
            ) : null}
            {pipeline.total ? (
                <>
                    <div
                        ref={setFrameElement}
                        id="pipeline-visualization"
                        className="pipeline-visualization-frame"
                        data-visualization={visualization}
                    >
                        {visualization === "sankey" &&
                        pipeline.graph &&
                        frameSize ? (
                            <svg
                                className="sankey-canvas"
                                viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
                                role="img"
                                aria-label="Sankey diagram of applications flowing through applied, no response, interview, offer, and exit statuses"
                                preserveAspectRatio="xMidYMid meet"
                            >
                                <g className="sankey-links">
                                    {pipeline.graph.links.map((link) => {
                                        const sourceId = getSankeyEndId(link.source);
                                        const targetId = getSankeyEndId(link.target);
                                        return (
                                            <path
                                                key={`${sourceId}-${targetId}`}
                                                d={linkPath(link) ?? undefined}
                                                stroke={link.color}
                                                strokeWidth={Math.max(1, link.width ?? 1)}
                                                className="sankey-link"
                                            >
                                                <title>{`${link.label}: ${link.value}`}</title>
                                            </path>
                                        );
                                    })}
                                </g>
                                <g className="sankey-nodes">
                                    {pipeline.graph.nodes.map((node) => {
                                        if (node.isRoutingNode) return null;

                                        const x0 = node.x0 ?? 0;
                                        const x1 = node.x1 ?? 0;
                                        const y0 = node.y0 ?? 0;
                                        const y1 = node.y1 ?? 0;
                                        const labelOnRight = x0 < frameSize.width - 180;
                                        return (
                                            <g key={node.id} className="sankey-node">
                                                <rect
                                                    x={x0}
                                                    y={y0}
                                                    width={Math.max(2, x1 - x0)}
                                                    height={Math.max(2, y1 - y0)}
                                                    rx="0"
                                                    fill={node.color}
                                                />
                                                <text
                                                    x={labelOnRight ? x1 + 8 : x0 - 8}
                                                    y={(y0 + y1) / 2}
                                                    textAnchor={labelOnRight ? "start" : "end"}
                                                    dominantBaseline="middle"
                                                >
                                                    <tspan
                                                        x={labelOnRight ? x1 + 8 : x0 - 8}
                                                        dy="-0.15em"
                                                        className="sankey-value"
                                                    >
                                                        {node.value ?? 0}
                                                    </tspan>
                                                    <tspan
                                                        x={labelOnRight ? x1 + 8 : x0 - 8}
                                                        dy="1.2em"
                                                        className="sankey-label"
                                                    >
                                                        {node.label}
                                                    </tspan>
                                                </text>
                                            </g>
                                        );
                                    })}
                                </g>
                            </svg>
                        ) : null}
                        {visualization === "bar" && frameSize ? (
                            <PipelineBarChart
                                data={timelineData}
                                size={frameSize}
                                rangeLabel={timelineRangeOption.label}
                            />
                        ) : null}
                        {visualization === "line" && frameSize ? (
                            <PipelineLineChart
                                data={timelineData}
                                size={frameSize}
                                rangeLabel={timelineRangeOption.label}
                            />
                        ) : null}
                    </div>
                    {visualization === "sankey" ? (
                        <dl
                            className="pipeline-mobile-summary"
                            aria-label="Application pipeline summary"
                        >
                            <div>
                                <dt>Applied</dt>
                                <dd>{pipeline.counts.APPLIED}</dd>
                            </div>
                            <div>
                                <dt>Interviewing</dt>
                                <dd>{pipeline.counts.INTERVIEWING}</dd>
                            </div>
                            <div>
                                <dt>Offers</dt>
                                <dd>{pipeline.counts.OFFER}</dd>
                            </div>
                            <div>
                                <dt>Closed</dt>
                                <dd>{pipeline.exitCount}</dd>
                            </div>
                        </dl>
                    ) : null}
                </>
            ) : (
                <div className="pipeline-empty-state">
                    <h3>
                        {visualization === "sankey"
                            ? "No application flow yet"
                            : "No application activity yet"}
                    </h3>
                    <p>Add applications to compare your pipeline in any view.</p>
                </div>
            )}
        </section>
    );
}
