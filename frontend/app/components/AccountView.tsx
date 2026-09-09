"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { AppIcon } from "./AppIcon";
import { DrawerBackdrop } from "./DrawerBackdrop";

export type AccountActionResult = {
    ok: boolean;
    message: string;
};

type AccountViewProps = {
    activePipeline: number;
    applicationCount: number;
    email: string;
    memberSince: string;
    name: string;
    onDeleteAccount: (password: string) => Promise<AccountActionResult>;
    onExport: (format: "json" | "csv") => Promise<AccountActionResult>;
    onPasswordChange: (values: {
        currentPassword: string;
        newPassword: string;
    }) => Promise<AccountActionResult>;
    onProfileSave: (values: {
        name: string;
        email: string;
    }) => Promise<AccountActionResult>;
    onReturnToDashboard: () => void;
    onSignOut: () => void;
};

type SectionStatus = AccountActionResult | null;
type AccountPanel = "profile" | "password" | null;

function formatMemberSince(value: string) {
    if (!value) return "Recently joined";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently joined";
    return `Member since ${new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric",
    }).format(date)}`;
}

export function AccountView({
    activePipeline,
    applicationCount,
    email,
    memberSince,
    name,
    onDeleteAccount,
    onExport,
    onPasswordChange,
    onProfileSave,
    onReturnToDashboard,
    onSignOut,
}: AccountViewProps) {
    const [profileName, setProfileName] = useState(name);
    const [profileEmail, setProfileEmail] = useState(email);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [deletePassword, setDeletePassword] = useState("");
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [activePanel, setActivePanel] = useState<AccountPanel>(null);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [profileStatus, setProfileStatus] = useState<SectionStatus>(null);
    const [passwordStatus, setPasswordStatus] = useState<SectionStatus>(null);
    const [dataStatus, setDataStatus] = useState<SectionStatus>(null);
    const [deleteStatus, setDeleteStatus] = useState<SectionStatus>(null);
    const panelFirstFieldRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!activePanel) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        panelFirstFieldRef.current?.focus();

        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setActivePanel(null);
        }

        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [activePanel]);

    function openProfilePanel() {
        setProfileName(name);
        setProfileEmail(email);
        setProfileStatus(null);
        setActivePanel("profile");
    }

    function openPasswordPanel() {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordStatus(null);
        setActivePanel("password");
    }

    function closePanel() {
        if (busyAction === "profile" || busyAction === "password") return;
        setActivePanel(null);
    }

    async function submitProfile(event: FormEvent) {
        event.preventDefault();
        if (!profileName.trim()) {
            setProfileStatus({ ok: false, message: "Name is required." });
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(profileEmail.trim())) {
            setProfileStatus({ ok: false, message: "Enter a valid email address." });
            return;
        }

        setBusyAction("profile");
        setProfileStatus(null);
        const result = await onProfileSave({
            name: profileName.trim(),
            email: profileEmail.trim(),
        });
        setProfileStatus(result);
        setBusyAction(null);
    }

    async function submitPassword(event: FormEvent) {
        event.preventDefault();
        if (newPassword.length < 8) {
            setPasswordStatus({
                ok: false,
                message: "New password must be at least 8 characters.",
            });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordStatus({ ok: false, message: "New passwords do not match." });
            return;
        }

        setBusyAction("password");
        setPasswordStatus(null);
        const result = await onPasswordChange({ currentPassword, newPassword });
        setPasswordStatus(result);
        setBusyAction(null);
        if (result.ok) {
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        }
    }

    async function exportData(format: "json" | "csv") {
        setBusyAction(`export-${format}`);
        setDataStatus(null);
        const result = await onExport(format);
        setDataStatus(result);
        setBusyAction(null);
    }

    async function confirmDelete(event: FormEvent) {
        event.preventDefault();
        setBusyAction("delete");
        setDeleteStatus(null);
        const result = await onDeleteAccount(deletePassword);
        setDeleteStatus(result);
        setBusyAction(null);
    }

    function renderStatus(status: SectionStatus) {
        if (!status) return null;
        return (
            <p className={status.ok ? "account-feedback success" : "account-feedback error"} role="status">
                {status.message}
            </p>
        );
    }

    return (
        <>
        <section className="account-page">
            <header className="account-hero">
                <div className="account-avatar">
                    <AppIcon name="account" size={38} strokeWidth={1.55} />
                </div>
                <div className="account-hero-copy">
                    <p>Account settings</p>
                    <h1>{name}</h1>
                    <span>{email}</span>
                    <small>{formatMemberSince(memberSince)}</small>
                </div>
                <div className="account-hero-stats" aria-label="Account summary">
                    <span><strong>{applicationCount}</strong> applications</span>
                    <span><strong>{activePipeline}</strong> active</span>
                </div>
            </header>

            <div className="account-settings-grid">
                <article className="account-settings-card">
                    <div className="account-section-heading">
                        <span><AppIcon name="account" size={19} /></span>
                        <div>
                            <h2>Profile</h2>
                            <p>Update the name and email used for your account.</p>
                        </div>
                    </div>
                    <div className="account-setting-summary">
                        <div>
                            <span>Signed in as</span>
                            <strong>{name}</strong>
                            <small>{email}</small>
                        </div>
                        <button type="button" className="secondary" onClick={openProfilePanel}>
                            <AppIcon name="edit" size={16} />
                            Edit profile
                        </button>
                    </div>
                </article>

                <article className="account-settings-card">
                    <div className="account-section-heading">
                        <span><AppIcon name="settings" size={19} /></span>
                        <div>
                            <h2>Password</h2>
                            <p>Changing it signs out your other active sessions.</p>
                        </div>
                    </div>
                    <div className="account-setting-summary">
                        <div>
                            <span>Account security</span>
                            <strong>Password protected</strong>
                            <small>Use at least 8 characters for your password.</small>
                        </div>
                        <button type="button" className="secondary" onClick={openPasswordPanel}>
                            <AppIcon name="settings" size={16} />
                            Change password
                        </button>
                    </div>
                </article>

                <article className="account-settings-card">
                    <div className="account-section-heading">
                        <span><AppIcon name="document" size={19} /></span>
                        <div>
                            <h2>Export your data</h2>
                            <p>Keep a portable copy of the information you have added.</p>
                        </div>
                    </div>
                    <div className="account-export-options">
                        <div>
                            <strong>Complete archive</strong>
                            <span>All account and job-search data in JSON.</span>
                            <button
                                type="button"
                                className="secondary"
                                disabled={busyAction === "export-json"}
                                onClick={() => exportData("json")}
                            >
                                <AppIcon name="document" size={16} />
                                {busyAction === "export-json" ? "Preparing..." : "Download JSON"}
                            </button>
                        </div>
                        <div>
                            <strong>Applications spreadsheet</strong>
                            <span>Your applications in a CSV-compatible format.</span>
                            <button
                                type="button"
                                className="secondary"
                                disabled={busyAction === "export-csv"}
                                onClick={() => exportData("csv")}
                            >
                                <AppIcon name="applications" size={16} />
                                {busyAction === "export-csv" ? "Preparing..." : "Download CSV"}
                            </button>
                        </div>
                    </div>
                    {renderStatus(dataStatus)}
                </article>
            </div>

            <article className="account-danger-zone">
                <div className="account-section-heading">
                    <span><AppIcon name="warning" size={19} /></span>
                    <div>
                        <h2>Danger zone</h2>
                        <p>Deleting your account permanently removes every application, interview, task, and contact.</p>
                    </div>
                </div>
                {!isDeleteOpen ? (
                    <button type="button" className="danger" onClick={() => setIsDeleteOpen(true)}>
                        <AppIcon name="trash" size={17} />
                        Delete account
                    </button>
                ) : (
                    <form className="account-delete-confirmation" onSubmit={confirmDelete}>
                        <label>
                            <span>Enter your password to confirm</span>
                            <input
                                type="password"
                                value={deletePassword}
                                autoComplete="current-password"
                                required
                                autoFocus
                                onChange={(event) => setDeletePassword(event.target.value)}
                            />
                        </label>
                        <div>
                            <button type="button" className="secondary" onClick={() => {
                                setIsDeleteOpen(false);
                                setDeletePassword("");
                                setDeleteStatus(null);
                            }}>
                                Cancel
                            </button>
                            <button type="submit" className="danger" disabled={busyAction === "delete"}>
                                {busyAction === "delete" ? "Deleting..." : "Permanently delete"}
                            </button>
                        </div>
                        {renderStatus(deleteStatus)}
                    </form>
                )}
            </article>

            <div className="account-actions">
                <button type="button" className="primary" onClick={onReturnToDashboard}>
                    <AppIcon name="arrow-left" size={17} />
                    Return to dashboard
                </button>
                <button type="button" className="secondary" onClick={onSignOut}>
                    <AppIcon name="logout" size={17} />
                    Sign out
                </button>
            </div>
        </section>
        {activePanel === "profile" && (
            <DrawerBackdrop onClose={closePanel}>
                <aside
                    className="application-drawer account-form-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="account-profile-panel-title"
                    onClick={(event) => event.stopPropagation()}
                >
                    <form className="account-popout-form" onSubmit={submitProfile}>
                        <header className="drawer-header">
                            <div>
                                <h2 id="account-profile-panel-title">Edit profile</h2>
                                <p>Update the name and email used throughout JobHazel.</p>
                            </div>
                            <button
                                type="button"
                                className="account-panel-close"
                                aria-label="Close profile panel"
                                onClick={closePanel}
                            >
                                <AppIcon name="x" size={20} />
                            </button>
                        </header>
                        <section className="account-popout-fields">
                            <label>
                                <span>Name</span>
                                <input
                                    ref={panelFirstFieldRef}
                                    value={profileName}
                                    maxLength={100}
                                    autoComplete="name"
                                    onChange={(event) => setProfileName(event.target.value)}
                                />
                            </label>
                            <label>
                                <span>Email address</span>
                                <input
                                    type="email"
                                    value={profileEmail}
                                    autoComplete="email"
                                    onChange={(event) => setProfileEmail(event.target.value)}
                                />
                            </label>
                        </section>
                        <footer className="account-popout-footer">
                            {renderStatus(profileStatus)}
                            <div>
                                <button type="button" className="secondary" onClick={closePanel}>Cancel</button>
                                <button type="submit" className="primary" disabled={busyAction === "profile"}>
                                    <AppIcon name="check" size={17} />
                                    {busyAction === "profile" ? "Saving..." : "Save profile"}
                                </button>
                            </div>
                        </footer>
                    </form>
                </aside>
            </DrawerBackdrop>
        )}
        {activePanel === "password" && (
            <DrawerBackdrop onClose={closePanel}>
                <aside
                    className="application-drawer account-form-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="account-password-panel-title"
                    onClick={(event) => event.stopPropagation()}
                >
                    <form className="account-popout-form" onSubmit={submitPassword}>
                        <header className="drawer-header">
                            <div>
                                <h2 id="account-password-panel-title">Change password</h2>
                                <p>Your other active sessions will be signed out after this change.</p>
                            </div>
                            <button
                                type="button"
                                className="account-panel-close"
                                aria-label="Close password panel"
                                onClick={closePanel}
                            >
                                <AppIcon name="x" size={20} />
                            </button>
                        </header>
                        <section className="account-popout-fields">
                            <label>
                                <span>Current password</span>
                                <input
                                    ref={panelFirstFieldRef}
                                    type="password"
                                    value={currentPassword}
                                    autoComplete="current-password"
                                    required
                                    onChange={(event) => setCurrentPassword(event.target.value)}
                                />
                            </label>
                            <label>
                                <span>New password</span>
                                <input
                                    type="password"
                                    value={newPassword}
                                    minLength={8}
                                    autoComplete="new-password"
                                    required
                                    onChange={(event) => setNewPassword(event.target.value)}
                                />
                            </label>
                            <label>
                                <span>Confirm password</span>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    minLength={8}
                                    autoComplete="new-password"
                                    required
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                />
                            </label>
                        </section>
                        <footer className="account-popout-footer">
                            {renderStatus(passwordStatus)}
                            <div>
                                <button type="button" className="secondary" onClick={closePanel}>Cancel</button>
                                <button type="submit" className="primary" disabled={busyAction === "password"}>
                                    {busyAction === "password" ? "Updating..." : "Update password"}
                                </button>
                            </div>
                        </footer>
                    </form>
                </aside>
            </DrawerBackdrop>
        )}
        </>
    );
}
