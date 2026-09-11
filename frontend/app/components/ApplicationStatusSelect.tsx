"use client";

import { STATUSES, STATUS_LABELS } from "../lib/constants";
import type { ApplicationStatus } from "../lib/types";

type ApplicationStatusSelectProps = {
    value: string;
    onChange: (value: string) => void;
};

export function ApplicationStatusSelect({
    value,
    onChange,
}: ApplicationStatusSelectProps) {
    const normalized = STATUSES.includes(value as ApplicationStatus)
        ? (value as ApplicationStatus)
        : "SAVED";

    return (
        <span className={`application-status-select status-${normalized.toLowerCase()}`}>
            <span className="application-status-dot" aria-hidden="true" />
            <select value={normalized} onChange={(event) => onChange(event.target.value)}>
                {STATUSES.map((status) => (
                    <option key={status} value={status}>
                        {STATUS_LABELS[status]}
                    </option>
                ))}
            </select>
        </span>
    );
}
