import { AppIcon } from "./AppIcon";

export type ActiveFilterChip = {
    id: string;
    label: string;
    value: string;
    onRemove: () => void;
};

type ActiveFilterChipsProps = {
    chips: ActiveFilterChip[];
    className?: string;
};

export function ActiveFilterChips({ chips, className = "" }: ActiveFilterChipsProps) {
    if (chips.length === 0) return null;

    return (
        <div
            className={`active-filter-chips${className ? ` ${className}` : ""}`}
            aria-label="Active filters"
        >
            {chips.map((chip) => (
                <button
                    key={chip.id}
                    type="button"
                    className="active-filter-chip"
                    onClick={chip.onRemove}
                    aria-label={`Remove ${chip.label} filter: ${chip.value}`}
                >
                    <span><strong>{chip.label}:</strong> {chip.value}</span>
                    <AppIcon name="x" size={13} />
                </button>
            ))}
        </div>
    );
}
