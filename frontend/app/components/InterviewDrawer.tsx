"use client";

import type { FormEvent } from "react";

import {
    INTERVIEW_OUTCOME_LABELS,
    INTERVIEW_OUTCOMES,
    INTERVIEW_TYPE_LABELS,
    INTERVIEW_TYPES,
} from "../lib/constants";
import type { Application, InterviewFormValues } from "../lib/types";
import { AppIcon } from "./AppIcon";
import { DrawerBackdrop } from "./DrawerBackdrop";

type InterviewDrawerProps = {
    applications: Application[];
    editingId: string | null;
    form: InterviewFormValues;
    formErrors: Record<string, string>;
    onClose: () => void;
    onFormChange: (form: InterviewFormValues) => void;
    onRemoveInterview: (id: string) => void;
    onSubmit: (event: FormEvent) => void;
};

function getApplicationLabel(application: Application) {
    return `${application.title} at ${application.companyName ?? "Unknown company"}`;
}

export function InterviewDrawer({
    applications,
    editingId,
    form,
    formErrors,
    onClose,
    onFormChange,
    onRemoveInterview,
    onSubmit,
}: InterviewDrawerProps) {
    const isEditing = Boolean(editingId);

    return (
        <DrawerBackdrop onClose={onClose}>
            <aside
                className="application-drawer interview-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="interview-drawer-title"
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
                            <h2 id="interview-drawer-title">
                                {isEditing ? "Edit interview" : "Add interview"}
                            </h2>
                            <p>
                                Track schedule details, interviewers, meeting links, and
                                outcomes for an application.
                            </p>
                        </div>
                    </header>
                    {applications.length === 0 && (
                        <p className="duplicate-warning">
                            Add an application before scheduling an interview.
                        </p>
                    )}
                    <section className="form-section">
                        <h3>Interview details</h3>
                        <label>
                            Application *
                            <select
                                value={form.applicationId}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        applicationId: event.target.value,
                                    })
                                }
                                required
                            >
                                <option value="">Select an application</option>
                                {applications.map((application) => (
                                    <option key={application.id} value={application.id}>
                                        {getApplicationLabel(application)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {formErrors.applicationId && (
                            <span className="field-error">
                                {formErrors.applicationId}
                            </span>
                        )}
                        <label>
                            Type
                            <select
                                value={form.type}
                                onChange={(event) =>
                                    onFormChange({ ...form, type: event.target.value })
                                }
                            >
                                {INTERVIEW_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {INTERVIEW_TYPE_LABELS[type]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {formErrors.type && (
                            <span className="field-error">{formErrors.type}</span>
                        )}
                        <div className="form-grid-two">
                            <label>
                                Date *
                                <input
                                    type="date"
                                    value={form.scheduledDate}
                                    onChange={(event) =>
                                        onFormChange({
                                            ...form,
                                            scheduledDate: event.target.value,
                                        })
                                    }
                                    required
                                />
                            </label>
                            <label>
                                Time *
                                <input
                                    type="time"
                                    value={form.scheduledTime}
                                    onChange={(event) =>
                                        onFormChange({
                                            ...form,
                                            scheduledTime: event.target.value,
                                        })
                                    }
                                    required
                                />
                            </label>
                        </div>
                        {(formErrors.scheduledDate || formErrors.scheduledTime) && (
                            <span className="field-error">
                                {formErrors.scheduledDate ?? formErrors.scheduledTime}
                            </span>
                        )}
                        <label>
                            Duration
                            <input
                                type="number"
                                min="1"
                                max="1440"
                                value={form.durationMinutes}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        durationMinutes: event.target.value,
                                    })
                                }
                                placeholder="30"
                            />
                        </label>
                        {formErrors.durationMinutes && (
                            <span className="field-error">
                                {formErrors.durationMinutes}
                            </span>
                        )}
                    </section>
                    <section className="form-section">
                        <h3>Meeting details</h3>
                        <label>
                            Meeting URL
                            <input
                                type="url"
                                value={form.meetingUrl}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        meetingUrl: event.target.value,
                                    })
                                }
                                placeholder="https://..."
                            />
                        </label>
                        {formErrors.meetingUrl && (
                            <span className="field-error">{formErrors.meetingUrl}</span>
                        )}
                        <label>
                            Location
                            <input
                                value={form.location}
                                onChange={(event) =>
                                    onFormChange({ ...form, location: event.target.value })
                                }
                                placeholder="Zoom, phone, onsite, or office address"
                            />
                        </label>
                        <label>
                            Interviewer
                            <input
                                value={form.interviewerName}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        interviewerName: event.target.value,
                                    })
                                }
                                placeholder="Name, title, or panel"
                            />
                        </label>
                    </section>
                    <section className="form-section">
                        <h3>Outcome and notes</h3>
                        <label>
                            Outcome
                            <select
                                value={form.outcome}
                                onChange={(event) =>
                                    onFormChange({ ...form, outcome: event.target.value })
                                }
                            >
                                {INTERVIEW_OUTCOMES.map((outcome) => (
                                    <option key={outcome} value={outcome}>
                                        {INTERVIEW_OUTCOME_LABELS[outcome]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {formErrors.outcome && (
                            <span className="field-error">{formErrors.outcome}</span>
                        )}
                        <label>
                            Notes
                            <textarea
                                value={form.notes}
                                onChange={(event) =>
                                    onFormChange({ ...form, notes: event.target.value })
                                }
                                placeholder="Prep notes, follow-up details, or takeaways..."
                                rows={6}
                            />
                        </label>
                    </section>
                    <footer className="drawer-footer">
                        {isEditing && editingId && (
                            <button
                                type="button"
                                className="danger"
                                onClick={() => onRemoveInterview(editingId)}
                            >
                                Delete interview
                            </button>
                        )}
                        <button type="button" className="secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="primary">
                            {isEditing ? "Update interview" : "Save interview"}
                        </button>
                    </footer>
                </form>
            </aside>
        </DrawerBackdrop>
    );
}
