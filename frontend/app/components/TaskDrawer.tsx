"use client";

import type { FormEvent } from "react";

import { TASK_TYPE_LABELS, TASK_TYPES } from "../lib/constants";
import type { Application, TaskFormValues } from "../lib/types";
import { AppIcon } from "./AppIcon";
import { DrawerBackdrop } from "./DrawerBackdrop";

type TaskDrawerProps = {
    applications: Application[];
    editingId: string | null;
    form: TaskFormValues;
    formErrors: Record<string, string>;
    onClose: () => void;
    onFormChange: (form: TaskFormValues) => void;
    onRemoveTask: (id: string) => void;
    onSubmit: (event: FormEvent) => void;
};

function getApplicationLabel(application: Application) {
    return `${application.title} at ${application.companyName ?? "Unknown company"}`;
}

export function TaskDrawer({
    applications,
    editingId,
    form,
    formErrors,
    onClose,
    onFormChange,
    onRemoveTask,
    onSubmit,
}: TaskDrawerProps) {
    const isEditing = Boolean(editingId);

    return (
        <DrawerBackdrop onClose={onClose}>
            <aside
                className="application-drawer task-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="task-drawer-title"
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
                            <h2 id="task-drawer-title">
                                {isEditing ? "Edit task" : "Create task"}
                            </h2>
                            <p>
                                Track follow-ups, interview prep, reminders, and thank-you
                                notes.
                            </p>
                        </div>
                    </header>

                    <section className="form-section">
                        <h3>Task details</h3>
                        <label>
                            Title *
                            <input
                                value={form.title}
                                onChange={(event) =>
                                    onFormChange({ ...form, title: event.target.value })
                                }
                                placeholder="e.g. Follow up with recruiter"
                                required
                            />
                        </label>
                        {formErrors.title && (
                            <span className="field-error">{formErrors.title}</span>
                        )}
                        <label>
                            Type
                            <select
                                value={form.type}
                                onChange={(event) =>
                                    onFormChange({ ...form, type: event.target.value })
                                }
                            >
                                {TASK_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {TASK_TYPE_LABELS[type]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {formErrors.type && (
                            <span className="field-error">{formErrors.type}</span>
                        )}
                        <label>
                            Application
                            <select
                                value={form.applicationId}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        applicationId: event.target.value,
                                    })
                                }
                            >
                                <option value="">No linked application</option>
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
                            Due date
                            <input
                                type="date"
                                value={form.dueDate}
                                onChange={(event) =>
                                    onFormChange({ ...form, dueDate: event.target.value })
                                }
                            />
                        </label>
                        {formErrors.dueDate && (
                            <span className="field-error">{formErrors.dueDate}</span>
                        )}
                    </section>

                    <section className="form-section">
                        <h3>Notes</h3>
                        <label>
                            Description
                            <textarea
                                value={form.description}
                                onChange={(event) =>
                                    onFormChange({
                                        ...form,
                                        description: event.target.value,
                                    })
                                }
                                placeholder="Add context, contact names, or next steps..."
                                rows={7}
                            />
                        </label>
                    </section>

                    <footer className="drawer-footer">
                        {isEditing && editingId && (
                            <button
                                type="button"
                                className="danger"
                                onClick={() => onRemoveTask(editingId)}
                            >
                                Delete task
                            </button>
                        )}
                        <button type="button" className="secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="primary">
                            {isEditing ? "Update task" : "Save task"}
                        </button>
                    </footer>
                </form>
            </aside>
        </DrawerBackdrop>
    );
}
