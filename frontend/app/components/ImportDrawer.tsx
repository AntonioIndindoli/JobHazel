"use client";

import type { FormEvent } from "react";

import { SOURCE_OPTIONS } from "../lib/constants";
import type {
    Application,
    ImportCaptureValues,
    ImportDraft,
    ImportReviewValues,
    ParserDebug,
} from "../lib/types";
import { AppIcon } from "./AppIcon";
import { ApplicationStatusSelect } from "./ApplicationStatusSelect";
import { DrawerBackdrop } from "./DrawerBackdrop";

type ImportDrawerProps = {
    importCapture: ImportCaptureValues;
    importDraft: ImportDraft | null;
    importDuplicates: Application[];
    importErrors: Record<string, string>;
    importReview: ImportReviewValues;
    importStep: "capture" | "review";
    isImportSubmitting: boolean;
    parserDebug: ParserDebug | null;
    onCaptureChange: (importCapture: ImportCaptureValues) => void;
    onClose: () => void;
    onCreateDraft: (event: FormEvent) => void;
    onReviewChange: (importReview: ImportReviewValues) => void;
    onReviewSubmit: (event: FormEvent) => void;
    onStepChange: (step: "capture" | "review") => void;
};

export function ImportDrawer({
    importCapture,
    importDraft,
    importDuplicates,
    importErrors,
    importReview,
    importStep,
    isImportSubmitting,
    parserDebug,
    onCaptureChange,
    onClose,
    onCreateDraft,
    onReviewChange,
    onReviewSubmit,
    onStepChange,
}: ImportDrawerProps) {
    return (
        <DrawerBackdrop onClose={onClose}>
            <aside
                className="application-drawer import-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-drawer-title"
                onClick={(event) => event.stopPropagation()}
            >
                {importStep === "capture" ? (
                    <form onSubmit={onCreateDraft}>
                        <header className="drawer-header">
                            <button
                                type="button"
                                className="drawer-close"
                                onClick={onClose}
                            >
                                <AppIcon name="arrow-left" size={20} />
                            </button>
                            <div>
                                <h2 id="import-drawer-title">Import job</h2>
                                <p>Paste the posting details and create a review draft.</p>
                            </div>
                        </header>
                        <section className="form-section">
                            <h3>Posting source</h3>
                            <label>
                                Job URL
                                <input
                                    type="url"
                                    value={importCapture.sourceUrl}
                                    onChange={(event) =>
                                        onCaptureChange({
                                            ...importCapture,
                                            sourceUrl: event.target.value,
                                        })
                                    }
                                    placeholder="https://..."
                                />
                            </label>
                            {importErrors.sourceUrl && (
                                <span className="field-error">
                                    {importErrors.sourceUrl}
                                </span>
                            )}
                            <label>
                                Page title
                                <input
                                    value={importCapture.pageTitle}
                                    onChange={(event) =>
                                        onCaptureChange({
                                            ...importCapture,
                                            pageTitle: event.target.value,
                                        })
                                    }
                                    placeholder="Senior Frontend Engineer - ExampleCo"
                                />
                            </label>
                        </section>
                        <section className="form-section">
                            <h3>Job description</h3>
                            <label>
                                Posting text
                                <textarea
                                    value={importCapture.rawText}
                                    onChange={(event) =>
                                        onCaptureChange({
                                            ...importCapture,
                                            rawText: event.target.value,
                                        })
                                    }
                                    placeholder="Paste the job description..."
                                    rows={10}
                                />
                            </label>
                            {importErrors.rawText && (
                                <span className="field-error">
                                    {importErrors.rawText}
                                </span>
                            )}
                            {importErrors.submit && (
                                <div className="import-request-error" role="alert">
                                    {importErrors.submit}
                                </div>
                            )}
                        </section>
                        <footer className="drawer-footer">
                            <button type="button" className="secondary" onClick={onClose}>
                                Cancel
                            </button>
                            <button className="primary" disabled={isImportSubmitting}>
                                {isImportSubmitting ? "Creating..." : "Create draft"}
                            </button>
                        </footer>
                    </form>
                ) : (
                    <form onSubmit={onReviewSubmit}>
                        <header className="drawer-header">
                            <button
                                type="button"
                                className="drawer-close"
                                onClick={onClose}
                            >
                                <AppIcon name="arrow-left" size={20} />
                            </button>
                            <div>
                                <h2 id="import-drawer-title">Review import</h2>
                                <p>Confirm the parsed job before saving it.</p>
                            </div>
                        </header>
                        {typeof importDraft?.confidence === "number" && (
                            <div className="import-confidence">
                                <span>Confidence</span>
                                <strong>{Math.round(importDraft.confidence * 100)}%</strong>
                            </div>
                        )}
                        {parserDebug && (
                            <details className="parser-debug">
                                <summary>Parser debug</summary>
                                <pre>{JSON.stringify(parserDebug, null, 2)}</pre>
                            </details>
                        )}
                        {importDuplicates.length > 0 && (
                            <div className="duplicate-warning import-warning">
                                <strong>Possible duplicate</strong>
                                <ul className="import-duplicate-list">
                                    {importDuplicates.map((duplicate) => (
                                        <li key={duplicate.id}>
                                            {duplicate.title} at{" "}
                                            {duplicate.companyName ?? "Unknown company"}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <section className="form-section">
                            <h3>Primary details</h3>
                            <label>
                                Job title *
                                <input
                                    value={importReview.title}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            title: event.target.value,
                                        })
                                    }
                                    required
                                />
                            </label>
                            {importErrors.title && (
                                <span className="field-error">{importErrors.title}</span>
                            )}
                            <label>
                                Company
                                <input
                                    value={importReview.companyName}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            companyName: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label>
                                Status
                                <ApplicationStatusSelect
                                    value={importReview.status}
                                    onChange={(status) =>
                                        onReviewChange({
                                            ...importReview,
                                            status,
                                        })
                                    }
                                />
                            </label>
                            {importErrors.status && (
                                <span className="field-error">{importErrors.status}</span>
                            )}
                            <label>
                                Location
                                <input
                                    value={importReview.location}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            location: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            <label>
                                Date applied
                                <input
                                    type="date"
                                    value={importReview.dateApplied}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            dateApplied: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            {importErrors.dateApplied && (
                                <span className="field-error">
                                    {importErrors.dateApplied}
                                </span>
                            )}
                        </section>
                        <section className="form-section">
                            <h3>Source details</h3>
                            <label>
                                Source
                                <select
                                    value={importReview.source}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            source: event.target.value,
                                        })
                                    }
                                >
                                    {importReview.source &&
                                        !SOURCE_OPTIONS.includes(importReview.source) && (
                                            <option value={importReview.source}>
                                                {importReview.source}
                                            </option>
                                        )}
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
                                    value={importReview.sourceUrl}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            sourceUrl: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            {importErrors.sourceUrl && (
                                <span className="field-error">
                                    {importErrors.sourceUrl}
                                </span>
                            )}
                        </section>
                        <section className="form-section">
                            <h3>Compensation</h3>
                            <div className="form-grid-two">
                                <label>
                                    Salary min
                                    <input
                                        inputMode="numeric"
                                        value={importReview.salaryMin}
                                        onChange={(event) =>
                                            onReviewChange({
                                                ...importReview,
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
                                        value={importReview.salaryMax}
                                        onChange={(event) =>
                                            onReviewChange({
                                                ...importReview,
                                                salaryMax: event.target.value,
                                            })
                                        }
                                        placeholder="160000"
                                    />
                                </label>
                            </div>
                            {importErrors.salaryMin && (
                                <span className="field-error">
                                    {importErrors.salaryMin}
                                </span>
                            )}
                            {importErrors.salaryMax && (
                                <span className="field-error">
                                    {importErrors.salaryMax}
                                </span>
                            )}
                        </section>
                        <section className="form-section">
                            <h3>Notes</h3>
                            <label>
                                Notes
                                <textarea
                                    value={importReview.notes}
                                    onChange={(event) =>
                                        onReviewChange({
                                            ...importReview,
                                            notes: event.target.value,
                                        })
                                    }
                                    rows={6}
                                />
                            </label>
                        </section>
                        {importErrors.submit && (
                            <div className="import-request-error" role="alert">
                                {importErrors.submit}
                            </div>
                        )}
                        <footer className="drawer-footer">
                            <button
                                type="button"
                                className="secondary"
                                onClick={() => onStepChange("capture")}
                            >
                                Back
                            </button>
                            <button type="button" className="secondary" onClick={onClose}>
                                Cancel
                            </button>
                            <button className="primary" disabled={isImportSubmitting}>
                                {isImportSubmitting ? "Saving..." : "Save application"}
                            </button>
                        </footer>
                    </form>
                )}
            </aside>
        </DrawerBackdrop>
    );
}
