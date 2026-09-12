"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { AppIcon } from "./AppIcon";

type Props = {
    label: string;
    onCollapse: () => void;
    onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onResizeBy: (direction: -1 | 1) => void;
};

export function CollectionPaneDivider({ onResizeStart, onResizeBy }: Omit<Props, "label" | "onCollapse">) {
    return (
        <div
            className="collection-pane-divider"
            role="separator"
            aria-label="Resize detail pane"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerDown={onResizeStart}
            onKeyDown={(event) => {
                if (event.key === "ArrowLeft") { event.preventDefault(); onResizeBy(1); }
                if (event.key === "ArrowRight") { event.preventDefault(); onResizeBy(-1); }
            }}
        ><span /></div>
    );
}

export function CollectionPaneCollapse({ label, onCollapse }: Pick<Props, "label" | "onCollapse">) {
    return (
        <button type="button" className="collection-pane-collapse" onClick={onCollapse} aria-label={`Collapse ${label} details`} title="Collapse detail pane">
            <AppIcon name="arrow-left" size={17} />
        </button>
    );
}
