"use client";

import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
    type KeyboardEvent,
} from "react";

import { formatResumeSize } from "../lib/resume-api";
import type { ResumeMetadataUpdate, ResumeVersion } from "../lib/types";
import { AppIcon } from "./AppIcon";

type ResumeFilter = "active" | "archived" | "all";

type ResumeLibraryViewProps = {
    busyResumeId: string | null;
    error: string;
    isLoading: boolean;
    onArchiveChange: (resume: ResumeVersion, archived: boolean) => Promise<void>;
    onDownload: (resume: ResumeVersion) => Promise<void>;
    onDelete: (resume: ResumeVersion) => Promise<void>;
    onMetadataUpdate: (
        resume: ResumeVersion,
        update: ResumeMetadataUpdate,
    ) => Promise<void>;
    onRetry: () => void;
    onUploadOpen: () => void;
    resumes: ResumeVersion[];
};

function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}

function ResumeActionsMenu({
    busy,
    onArchive,
    onDownload,
    onDelete,
    onEdit,
    resume,
}: {
    busy: boolean;
    onArchive: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onEdit: () => void;
    resume: ResumeVersion;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();

        function handlePointerDown(event: MouseEvent) {
            if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
        }
        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [isOpen]);

    function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? [],
        );
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") {
            event.preventDefault();
            setIsOpen(false);
            triggerRef.current?.focus();
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            items[(index + 1) % items.length]?.focus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            items[(index - 1 + items.length) % items.length]?.focus();
        } else if (event.key === "Home") {
            event.preventDefault();
            items[0]?.focus();
        } else if (event.key === "End") {
            event.preventDefault();
            items.at(-1)?.focus();
        }
    }

    function run(action: () => void) {
        setIsOpen(false);
        action();
    }

    return (
        <div ref={rootRef} className="resume-actions-menu">
            <button
                ref={triggerRef}
                type="button"
                className="resume-icon-button"
                aria-label={`More actions for ${resume.name}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                disabled={busy}
                onClick={() => setIsOpen((open) => !open)}
            >
                <AppIcon name="dots-vertical" size={19} />
            </button>
            {isOpen && (
                <div
                    ref={menuRef}
                    className="resume-actions-popover"
                    role="menu"
                    aria-label={`Actions for ${resume.name}`}
                    onKeyDown={handleMenuKeyDown}
                >
                    <button type="button" role="menuitem" onClick={() => run(onDownload)}>
                        <AppIcon name="external-link" size={16} />
                        Download PDF
                    </button>
                    <button type="button" role="menuitem" onClick={() => run(onEdit)}>
                        <AppIcon name="edit" size={16} />
                        Edit details
                    </button>
                    <button type="button" role="menuitem" onClick={() => run(onArchive)}>
                        <AppIcon name={resume.archivedAt ? "history" : "ledger"} size={16} />
                        {resume.archivedAt ? "Restore version" : "Archive version"}
                    </button>
                    <button type="button" role="menuitem" className="danger-text" onClick={() => run(onDelete)}>
                        <AppIcon name="trash" size={16} />
                        Permanently delete
                    </button>
                </div>
            )}
        </div>
    );
}

function ResumeDeleteDialog({
    busy,
    onClose,
    onConfirm,
    resume,
}: {
    busy: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    resume: ResumeVersion;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const [error, setError] = useState("");
    const isReferenced = resume.applicationCount > 0;

    useEffect(() => {
        dialogRef.current?.showModal();
        cancelRef.current?.focus();
    }, []);

    async function confirmDelete() {
        try {
            setError("");
            await onConfirm();
            onClose();
        } catch (deleteError) {
            setError(
                deleteError instanceof Error
                    ? deleteError.message
                    : "This resume could not be deleted.",
            );
        }
    }

    return (
        <dialog
            ref={dialogRef}
            className="resume-dialog resume-delete-dialog"
            aria-labelledby="resume-delete-title"
            onCancel={(event) => {
                if (busy) event.preventDefault();
                else onClose();
            }}
            onClose={onClose}
        >
            <div className="resume-delete-dialog-body">
                <span className="resume-delete-icon"><AppIcon name="trash" size={22} /></span>
                <div>
                    <span className="resume-dialog-eyebrow">Permanent deletion</span>
                    <h2 id="resume-delete-title">Delete {resume.name}?</h2>
                    <p>
                        Archiving hides a version from new selections while preserving
                        its PDF and application history. Permanent deletion removes the
                        file and cannot be undone.
                    </p>
                    {isReferenced && (
                        <p className="resume-delete-conflict" role="status">
                            This version is used in {resume.applicationCount}{" "}
                            {resume.applicationCount === 1 ? "application" : "applications"}.
                            Remove those links before deleting it.
                        </p>
                    )}
                    {error && <p className="resume-field-error" role="alert">{error}</p>}
                </div>
            </div>
            <div className="resume-dialog-footer">
                <button ref={cancelRef} type="button" className="alternative" disabled={busy} onClick={onClose}>Cancel</button>
                <button type="button" className="resume-delete-confirm" disabled={busy || isReferenced} onClick={confirmDelete}>
                    {busy ? "Deleting…" : "Delete permanently"}
                </button>
            </div>
        </dialog>
    );
}

function ResumeEditDialog({
    onClose,
    onSave,
    resume,
}: {
    onClose: () => void;
    onSave: (update: ResumeMetadataUpdate) => Promise<void>;
    resume: ResumeVersion;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(resume.name);
    const [targetRole, setTargetRole] = useState(resume.targetRole ?? "");
    const [notes, setNotes] = useState(resume.notes ?? "");
    const [error, setError] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        dialogRef.current?.showModal();
        nameInputRef.current?.focus();
    }, []);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!name.trim()) return setError("Display name is required.");
        if (name.trim().length > 150 || targetRole.trim().length > 150) {
            return setError("Display name and target role must be 150 characters or less.");
        }
        if (notes.trim().length > 5000) return setError("Notes must be 5,000 characters or less.");

        try {
            setIsSaving(true);
            setError("");
            await onSave({
                name: name.trim(),
                notes: notes.trim() || null,
                targetRole: targetRole.trim() || null,
            });
            onClose();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Resume details could not be saved.");
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <dialog
            ref={dialogRef}
            className="resume-dialog resume-edit-dialog"
            aria-labelledby="resume-edit-title"
            onCancel={(event) => {
                if (isSaving) event.preventDefault();
                else onClose();
            }}
            onClose={onClose}
        >
            <form method="dialog" onSubmit={submit}>
                <div className="resume-dialog-header">
                    <div>
                        <span className="resume-dialog-eyebrow">Resume details</span>
                        <h2 id="resume-edit-title">Edit version</h2>
                        <p>The PDF stays unchanged.</p>
                    </div>
                    <button type="button" className="resume-icon-button" aria-label="Close edit resume" disabled={isSaving} onClick={onClose}>
                        <AppIcon name="x" size={20} />
                    </button>
                </div>
                <div className="resume-dialog-body resume-form-grid">
                    <label className="resume-field resume-field-full">
                        <span>Display name</span>
                        <input ref={nameInputRef} value={name} maxLength={150} disabled={isSaving} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <label className="resume-field resume-field-full">
                        <span>Target role <small>Optional</small></span>
                        <input value={targetRole} maxLength={150} disabled={isSaving} onChange={(event) => setTargetRole(event.target.value)} />
                    </label>
                    <label className="resume-field resume-field-full">
                        <span>Notes <small>Optional</small></span>
                        <textarea value={notes} maxLength={5000} disabled={isSaving} onChange={(event) => setNotes(event.target.value)} />
                    </label>
                    {error && <p className="resume-field-error resume-field-full" role="alert">{error}</p>}
                </div>
                <div className="resume-dialog-footer">
                    <button type="button" className="alternative" disabled={isSaving} onClick={onClose}>Cancel</button>
                    <button type="submit" className="primary" disabled={isSaving}>
                        {isSaving ? "Saving…" : "Save details"}
                    </button>
                </div>
            </form>
        </dialog>
    );
}

export function ResumeLibraryView({
    busyResumeId,
    error,
    isLoading,
    onArchiveChange,
    onDelete,
    onDownload,
    onMetadataUpdate,
    onRetry,
    onUploadOpen,
    resumes,
}: ResumeLibraryViewProps) {
    const [filter, setFilter] = useState<ResumeFilter>("active");
    const [editingResume, setEditingResume] = useState<ResumeVersion | null>(null);
    const [deletingResume, setDeletingResume] = useState<ResumeVersion | null>(null);
    const activeResumes = resumes.filter((resume) => !resume.archivedAt);
    const archivedResumes = resumes.filter((resume) => Boolean(resume.archivedAt));
    const visibleResumes =
        filter === "active" ? activeResumes : filter === "archived" ? archivedResumes : resumes;

    if (isLoading) {
        return (
            <section className="resume-page" aria-labelledby="resume-library-heading" aria-busy="true">
                <div className="resume-loading-grid" aria-label="Loading resumes">
                    {[0, 1, 2].map((item) => <div className="resume-card-skeleton" key={item} />)}
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className="resume-page" aria-labelledby="resume-library-heading">
                <div className="resume-error-state" role="alert">
                    <span className="resume-error-icon"><AppIcon name="warning" size={24} /></span>
                    <h2 id="resume-library-heading">We couldn’t load your resumes</h2>
                    <p>{error}</p>
                    <button type="button" className="secondary" onClick={onRetry}>Try again</button>
                </div>
            </section>
        );
    }

    return (
        <section className="resume-page" aria-labelledby="resume-library-heading">
            {resumes.length === 0 ? (
                <div className="resume-empty-state">
                    <span className="resume-empty-illustration"><AppIcon name="document" size={31} /></span>
                    <h3>Build your resume library</h3>
                    <p>Upload your first PDF, then reuse it when you apply for roles.</p>
                    <button type="button" className="primary" onClick={onUploadOpen}>
                        <AppIcon name="plus" size={18} />
                        Upload first resume
                    </button>
                </div>
            ) : (
                <>
                    <div className="resume-library-toolbar">
                        <div className="resume-filter-tabs" role="group" aria-label="Filter resumes">
                            <button type="button" aria-pressed={filter === "active"} onClick={() => setFilter("active")}>Active <span>{activeResumes.length}</span></button>
                            <button type="button" aria-pressed={filter === "archived"} onClick={() => setFilter("archived")}>Archived <span>{archivedResumes.length}</span></button>
                            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span>{resumes.length}</span></button>
                        </div>
                    </div>

                    {visibleResumes.length === 0 ? (
                        <div className="resume-filter-empty">
                            <AppIcon name="document" size={24} />
                            <h3>No {filter} resumes</h3>
                            <p>{filter === "archived" ? "Archived versions will appear here." : "Restore an archived version or upload a new PDF."}</p>
                        </div>
                    ) : (
                        <div className="resume-card-grid">
                            {visibleResumes.map((resume) => {
                                const isBusy = busyResumeId === resume.id;
                                return (
                                    <article className={`resume-card${resume.archivedAt ? " is-archived" : ""}`} key={resume.id}>
                                        <div className="resume-card-topline">
                                            <span className="resume-file-mark"><AppIcon name="document" size={22} /></span>
                                            <span className={`resume-status-pill ${resume.archivedAt ? "archived" : "active"}`}>
                                                {resume.archivedAt ? "Archived" : "Active"}
                                            </span>
                                            <ResumeActionsMenu
                                                busy={isBusy}
                                                resume={resume}
                                                onArchive={() => onArchiveChange(resume, !resume.archivedAt)}
                                                onDelete={() => setDeletingResume(resume)}
                                                onDownload={() => onDownload(resume)}
                                                onEdit={() => setEditingResume(resume)}
                                            />
                                        </div>
                                        <div className="resume-card-heading">
                                            <h3>{resume.name}</h3>
                                            <p>{resume.targetRole || "General resume"}</p>
                                        </div>
                                        <dl className="resume-card-details">
                                            <div>
                                                <dt>File</dt>
                                                <dd title={resume.originalFilename}>{resume.originalFilename}</dd>
                                            </div>
                                            <div>
                                                <dt>Size</dt>
                                                <dd>{formatResumeSize(resume.sizeBytes)}</dd>
                                            </div>
                                            <div>
                                                <dt>Added</dt>
                                                <dd>{formatDate(resume.createdAt)}</dd>
                                            </div>
                                            <div>
                                                <dt>Used in</dt>
                                                <dd>{resume.applicationCount} {resume.applicationCount === 1 ? "application" : "applications"}</dd>
                                            </div>
                                        </dl>
                                        {resume.notes && <p className="resume-card-notes">{resume.notes}</p>}
                                        <div className="resume-card-footer">
                                            <button type="button" className="resume-download-button" disabled={isBusy} onClick={() => onDownload(resume)}>
                                                {isBusy ? <span className="resume-button-spinner" aria-hidden="true" /> : <AppIcon name="external-link" size={16} />}
                                                Download PDF
                                            </button>
                                            <button type="button" className="resume-edit-button" disabled={isBusy} onClick={() => setEditingResume(resume)}>
                                                Edit details
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {editingResume && (
                <ResumeEditDialog
                    resume={editingResume}
                    onClose={() => setEditingResume(null)}
                    onSave={(update) => onMetadataUpdate(editingResume, update)}
                />
            )}
            {deletingResume && (
                <ResumeDeleteDialog
                    busy={busyResumeId === deletingResume.id}
                    resume={deletingResume}
                    onClose={() => setDeletingResume(null)}
                    onConfirm={() => onDelete(deletingResume)}
                />
            )}
        </section>
    );
}
