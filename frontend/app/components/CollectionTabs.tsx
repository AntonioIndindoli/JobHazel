"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

// Undefined supports standalone collection views; the shell supplies a header slot.
export const CollectionTabsTarget = createContext<HTMLDivElement | null | undefined>(undefined);

export function CollectionTabs({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: { value: string; label: string; count: number }[];
    onChange: (value: string) => void;
}) {
    const target = useContext(CollectionTabsTarget);
    const tabs = <nav className="collection-tabs" aria-label={label}>
        {options.map(option => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}<span>{option.count}</span>
        </button>)}
    </nav>;
    return target === undefined ? tabs : target ? createPortal(tabs, target) : null;
}
