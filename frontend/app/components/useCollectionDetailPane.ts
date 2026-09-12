"use client";

import { useCallback, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

const DEFAULT_DETAIL_WIDTH = 38;
const MIN_DETAIL_WIDTH = 30;
const MAX_DETAIL_WIDTH = 50;

type StoredPaneState = {
    isOpen: boolean;
    selectedId: string | null;
    detailWidth: number;
};

export function useCollectionDetailPane(storageKey: string, focusedId?: string | null) {
    const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
    const containerRef = useCallback((node: HTMLDivElement | null) => setContainerNode(node), []);
    const [selectedId, setSelectedId] = useState<string | null>(focusedId ?? null);
    const [isOpen, setIsOpen] = useState(Boolean(focusedId));
    const [detailWidth, setDetailWidth] = useState(DEFAULT_DETAIL_WIDTH);
    const [isDragging, setIsDragging] = useState(false);
    const [hasHydrated, setHasHydrated] = useState(false);

    useEffect(() => {
        if (focusedId) {
            setSelectedId(focusedId);
            setIsOpen(true);
            setHasHydrated(true);
            return;
        }

        try {
            const stored = window.localStorage.getItem(storageKey);
            if (!stored) return;
            const state = JSON.parse(stored) as Partial<StoredPaneState>;
            setSelectedId(typeof state.selectedId === "string" ? state.selectedId : null);
            setIsOpen(Boolean(state.isOpen));
            if (typeof state.detailWidth === "number") {
                setDetailWidth(Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, state.detailWidth)));
            }
        } catch {
            // Ignore stale or unavailable browser storage.
        } finally {
            setHasHydrated(true);
        }
    }, [focusedId, storageKey]);

    useEffect(() => {
        if (!hasHydrated) return;
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ isOpen, selectedId, detailWidth }));
        } catch {
            // The pane still works when storage is unavailable.
        }
    }, [detailWidth, hasHydrated, isOpen, selectedId, storageKey]);

    function select(id: string) {
        setSelectedId(id);
        setIsOpen(true);
    }

    function collapse() {
        setIsOpen(false);
    }

    function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault();
        const divider = event.currentTarget;
        divider.setPointerCapture(event.pointerId);
        setIsDragging(true);

        const resize = (pointerEvent: PointerEvent) => {
            const bounds = containerNode?.getBoundingClientRect();
            if (!bounds?.width) return;
            const nextWidth = ((bounds.right - pointerEvent.clientX) / bounds.width) * 100;
            setDetailWidth(Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, nextWidth)));
        };
        const finish = () => {
            setIsDragging(false);
            divider.removeEventListener("pointermove", resize);
            divider.removeEventListener("pointerup", finish);
            divider.removeEventListener("pointercancel", finish);
        };

        divider.addEventListener("pointermove", resize);
        divider.addEventListener("pointerup", finish);
        divider.addEventListener("pointercancel", finish);
    }

    function resizeWithKeyboard(direction: -1 | 1) {
        setDetailWidth((current) => Math.min(MAX_DETAIL_WIDTH, Math.max(MIN_DETAIL_WIDTH, current + direction * 2)));
    }

    return {
        containerRef,
        selectedId,
        isOpen,
        isDragging,
        select,
        collapse,
        beginResize,
        resizeWithKeyboard,
        splitStyle: { "--detail-pane-width": `${detailWidth}%` } as CSSProperties,
    };
}
