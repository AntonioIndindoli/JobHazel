"use client";

import { useRef, type ReactNode } from "react";

type DrawerBackdropProps = {
    children: ReactNode;
    onClose: () => void;
};

export function DrawerBackdrop({ children, onClose }: DrawerBackdropProps) {
    const pointerStartedOnBackdrop = useRef(false);

    return (
        <div
            className="drawer-backdrop"
            onPointerDownCapture={(event) => {
                pointerStartedOnBackdrop.current = event.target === event.currentTarget;
            }}
            onPointerCancel={() => {
                pointerStartedOnBackdrop.current = false;
            }}
            onClick={(event) => {
                // A drag from the form can also produce a click on the backdrop.
                const shouldClose = pointerStartedOnBackdrop.current &&
                    event.target === event.currentTarget;
                pointerStartedOnBackdrop.current = false;
                if (shouldClose) onClose();
            }}
        >
            {children}
        </div>
    );
}
