"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { NAV_ITEMS } from "../lib/constants";
import type { DashboardView } from "../lib/types";
import { AppIcon } from "./AppIcon";

type DashboardShellProps = {
    children: ReactNode;
    currentView: DashboardView;
    firstName: string;
    isProfileMenuOpen: boolean;
    onCurrentViewChange: (view: DashboardView) => void;
    onImportOpen: () => void;
    onProfileMenuChange: (isOpen: boolean | ((isOpen: boolean) => boolean)) => void;
    onSignOut: () => void;
    topbarPageControls?: ReactNode;
};

export function DashboardShell({
    children,
    currentView,
    firstName,
    isProfileMenuOpen,
    onCurrentViewChange,
    onImportOpen,
    onProfileMenuChange,
    onSignOut,
    topbarPageControls,
}: DashboardShellProps) {
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const mobileNavToggleRef = useRef<HTMLButtonElement>(null);
    const mobileNavCloseRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isMobileNavOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        mobileNavCloseRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsMobileNavOpen(false);
                mobileNavToggleRef.current?.focus();
            }
        }

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isMobileNavOpen]);

    useEffect(() => {
        const desktopQuery = window.matchMedia(
            currentView === "dashboard"
                ? "(min-width: 1401px)"
                : "(min-width: 1101px)",
        );

        function closeNavOnDesktop(event: MediaQueryListEvent) {
            if (event.matches) setIsMobileNavOpen(false);
        }

        desktopQuery.addEventListener("change", closeNavOnDesktop);
        return () => desktopQuery.removeEventListener("change", closeNavOnDesktop);
    }, [currentView]);

    function closeMobileNav({ restoreFocus = false } = {}) {
        setIsMobileNavOpen(false);
        if (restoreFocus) mobileNavToggleRef.current?.focus();
    }

    function getNavItemView(label: string): DashboardView | null {
        if (label === "Dashboard") return "dashboard";
        if (label === "Applications") return "applications";
        if (label === "Resumes") return "resumes";
        if (label === "Analytics") return "analytics";
        if (label === "Interviews") return "interviews";
        if (label === "Tasks") return "tasks";
        if (label === "Contacts") return "contacts";
        if (label === "Settings") return "settings";
        if (label === "Account") return "account";
        return null;
    }

    return (
        <div className={`dashboard-shell view-${currentView}`}>
            <button
                type="button"
                className={isMobileNavOpen ? "sidebar-backdrop open" : "sidebar-backdrop"}
                aria-label="Close navigation menu"
                tabIndex={isMobileNavOpen ? 0 : -1}
                onClick={() => closeMobileNav({ restoreFocus: true })}
            />
            <aside
                id="primary-navigation"
                className={isMobileNavOpen ? "sidebar mobile-open" : "sidebar"}
                aria-label="Primary navigation"
            >
                <div className="brand">
                    <span className="brand-mark">
                        <Image
                            src="/JobHazelIcon.png"
                            alt=""
                            width={31}
                            height={31}
                            priority
                        />
                    </span>
                    <strong>JobHazel</strong>
                    <button
                        ref={mobileNavCloseRef}
                        type="button"
                        className="mobile-sidebar-close"
                        aria-label="Close navigation menu"
                        onClick={() => closeMobileNav({ restoreFocus: true })}
                    >
                        <AppIcon name="x" size={21} />
                    </button>
                </div>
                <nav className="sidebar-nav" aria-label="Workspace">
                    {NAV_ITEMS.map((item) => {
                        const view = getNavItemView(item.label);

                        return (
                            <button
                                key={item.label}
                                type="button"
                                className={
                                    view && currentView === view
                                        ? "nav-item active"
                                        : "nav-item"
                                }
                                aria-current={view && currentView === view ? "page" : undefined}
                                title={item.label}
                                onClick={() => {
                                    if (view) onCurrentViewChange(view);
                                    if (item.label === "Import Job") onImportOpen();
                                    closeMobileNav();
                                }}
                            >
                                <AppIcon name={item.icon} size={18} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
                <div
                    className="profile sidebar-profile"
                    onBlur={(event) => {
                        if (
                            !event.currentTarget.contains(
                                event.relatedTarget as Node | null,
                            )
                        )
                            onProfileMenuChange(false);
                    }}
                >
                    <button
                        type="button"
                        className={
                            currentView === "account"
                                ? "profile-trigger active"
                                : "profile-trigger"
                        }
                        aria-haspopup="menu"
                        aria-expanded={isProfileMenuOpen}
                        onClick={() => onProfileMenuChange((open) => !open)}
                    >
                        <span className="avatar">
                            <AppIcon name="account" size={21} />
                        </span>
                        <span className="sidebar-profile-copy">
                            <strong>{firstName}</strong>
                            <small>Account</small>
                        </span>
                        <AppIcon name="chevron-down" size={16} />
                    </button>
                    {isProfileMenuOpen && (
                        <div className="profile-menu" role="menu">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    onCurrentViewChange("account");
                                    onProfileMenuChange(false);
                                    closeMobileNav();
                                }}
                            >
                                <AppIcon name="account" size={16} />
                                View account
                            </button>
                            <button type="button" role="menuitem" onClick={onSignOut}>
                                <AppIcon name="logout" size={16} />
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </aside>
            <main className="dashboard-main">
                <header className={topbarPageControls ? "topbar has-page-controls" : "topbar"}>
                    <button
                        ref={mobileNavToggleRef}
                        type="button"
                        className="mobile-nav-toggle"
                        aria-label="Open navigation menu"
                        aria-controls="primary-navigation"
                        aria-expanded={isMobileNavOpen}
                        onClick={() => setIsMobileNavOpen(true)}
                    >
                        <AppIcon name="menu" size={23} />
                    </button>
                    {topbarPageControls && (
                        <div className="topbar-page-controls">
                            {topbarPageControls}
                        </div>
                    )}
                </header>
                <div className="dashboard-page-content">{children}</div>
            </main>
        </div>
    );
}
