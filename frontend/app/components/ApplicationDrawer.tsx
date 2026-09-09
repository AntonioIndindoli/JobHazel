"use client";

import type { FormEvent } from "react";

import { SOURCE_OPTIONS, STATUSES, STATUS_LABELS } from "../lib/constants";
import type { Application, ApplicationFormValues } from "../lib/types";
import { AppIcon } from "./AppIcon";
import { DrawerBackdrop } from "./DrawerBackdrop";

type ApplicationDrawerProps = {
    duplicateMatch?: Application | null;
    editingId: string | null;
    form: ApplicationFormValues;
    formErrors: Record<string, string>;
    onClose: () => void;
    onFormChange: (form: ApplicationFormValues) => void;
    onRemoveApplication: (id: string) => void;
    onSubmit: (event: FormEvent) => void;
};

export function ApplicationDrawer({
    duplicateMatch,
    editingId,
    form,
    formErrors,
    onClose,
    onFormChange,
    onRemoveApplication,
    onSubmit,
}: ApplicationDrawerProps) {
    const isEditing = Boolean(editingId);

    return (
        <DrawerBackdrop onClose={onClose}>
            <aside
                className="application-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="application-drawer-title"
                onClick={(event) => event.stopPropagation()}
            >
                <form onSubmit={onSubmit}>
                    <header className="drawer-header">
                        <button
                            type="button"
                            className="drawer-close"
                            onClick={onClose}
                        >
                            <AppIcon name="arrow-left" size={20} />
                        </button>
                        <div>
                            <h2 id="application-drawer-title">
                                {isEditing ? "Edit application" : "Add application"}
                            </h2>
                            <p>
                                {isEditing
                                    ? "Update role details without losing your place in the pipeline."
                                    : "Track a role in your search and keep next steps organized."}
                            </p>
                        </div>
                    </header>
                    {duplicateMatch && (
                        <p className="duplicate-warning">
                            Possible duplicate: {duplicateMatch.title} at{" "}
                            {duplicateMatch.companyName ?? "Unknown company"}.
                        </p>
                    )}
                    <section className="form-section">
                        <h3>Primary details</h3>
                        <label>
                            Job title *
                            <input
                                value={form.title}
                                onChange={(event) =>
                                    onFormChange({ ...form, title: event.target.value })
                                }
                                placeholder="e.g. Senior Frontend Engineer"
                                required
                            />
                        </label>
                        {formErrors.title && (
                            <span className="field-error">{formErrors.title}</span>
                        )}
                        <label>
                            Company
                            <input
                                value={form.companyName}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        companyName: event.target.value,
                                    })
                                }
                                placeholder="e.g. Stripe"
                            />
                        </label>
                        <label>
                            Status
                            <select
                                value={form.status}
                                onChange={(event) =>
                                    onFormChange({ ...form, status: event.target.value })
                                }
                            >
                                {STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                        {STATUS_LABELS[status]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {formErrors.status && (
                            <span className="field-error">{formErrors.status}</span>
                        )}
                        <label>
                            Location
                            <input
                                value={form.location}
                                onChange={(event) =>
                                    onFormChange({ ...form, location: event.target.value })
                                }
                                placeholder="e.g. Remote, New York, NY"
                            />
                        </label>
                        <label>
                            Date applied
                            <input
                                type="date"
                                value={form.dateApplied}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        dateApplied: event.target.value,
                                    })
                                }
                            />
                        </label>
                        {formErrors.dateApplied && (
                            <span className="field-error">{formErrors.dateApplied}</span>
                        )}
                    </section>
                    <section className="form-section">
                        <h3>Source details</h3>
                        <label>
                            Source
                            <select
                                value={form.source}
                                onChange={(event) =>
                                    onFormChange({ ...form, source: event.target.value })
                                }
                            >
                                {SOURCE_OPTIONS.map((source) => (
                                    <option key={source || "blank"} value={source}>
                                        {source || "Select a source"}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Job URL
                            <input
                                type="url"
                                value={form.sourceUrl}
                                onChange={(event) =>
                                    onFormChange({ ...form, sourceUrl: event.target.value })
                                }
                                placeholder="https://..."
                            />
                        </label>
                        {formErrors.sourceUrl && (
                            <span className="field-error">{formErrors.sourceUrl}</span>
                        )}
                    </section>
                    <section className="form-section">
                        <h3>Compensation</h3>
                        <div className="form-grid-two">
                            <label>
                                Salary min
                                <input
                                    inputMode="numeric"
                                    value={form.salaryMin}
                                    onChange={(event) =>
                                        onFormChange({
                                            ...form,
                                            salaryMin: event.target.value,
                                        })
                                    }
                                    placeholder="120000"
                                />
                            </label>
                            <label>
                                Salary max
                                <input
                                    inputMode="numeric"
                                    value={form.salaryMax}
                                    onChange={(event) =>
                                        onFormChange({
                                            ...form,
                                            salaryMax: event.target.value,
                                        })
                                    }
                                    placeholder="160000"
                                />
                            </label>
                        </div>
                        {formErrors.salaryMin && (
                            <span className="field-error">{formErrors.salaryMin}</span>
                        )}
                        {formErrors.salaryMax && (
                            <span className="field-error">{formErrors.salaryMax}</span>
                        )}
                    </section>
                    <section className="form-section">
                        <h3>Notes</h3>
                        <label>
                            Notes
                            <textarea
                                value={form.notes}
                                onChange={(event) =>
                                    onFormChange({ ...form, notes: event.target.value })
                                }
                                placeholder="Paste notes, recruiter messages, or next steps..."
                                rows={6}
                            />
                        </label>
                    </section>
                    <footer className="drawer-footer">
                        <button type="button" className="secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="primary">
                            {isEditing ? "Update application" : "Save application"}
                        </button>
                    </footer>
                </form>
            </aside>
        </DrawerBackdrop>
    );
}
