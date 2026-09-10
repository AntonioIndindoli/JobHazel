"use client";

import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type FormEvent,
} from "react";

import {
    calculateResumeChecksum,
    getResumeErrorMessage,
    resumeNameFromFilename,
    uploadResumeFile,
    validateResumeFile,
} from "../lib/resume-api";
import type {
    ResumeUploadInitiation,
    ResumeUploadMetadata,
    ResumeVersion,
} from "../lib/types";
import { AppIcon } from "./AppIcon";

type UploadPhase =
    | "idle"
    | "hashing"
    | "starting"
    | "uploading"
    | "completing"
    | "upload-error"
    | "completion-error";

type ResumeUploadDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    onComplete: (resumeId: string) => Promise<ResumeVersion>;
    onInitiate: (metadata: ResumeUploadMetadata) => Promise<ResumeUploadInitiation>;
    onSuccess: (resume: ResumeVersion) => void;
    calculateChecksum?: (file: File) => Promise<string>;
    uploadFile?: typeof uploadResumeFile;
};

function phaseLabel(phase: UploadPhase, progress: number) {
    if (phase === "hashing") return "Preparing PDF…";
    if (phase === "starting") return "Creating resume version…";
    if (phase === "uploading") return `Uploading PDF… ${progress}%`;
    if (phase === "completing") return "Verifying upload…";
    return "Upload resume";
}

export function ResumeUploadDialog({
    calculateChecksum = calculateResumeChecksum,
    isOpen,
    onClose,
    onComplete,
    onInitiate,
    onSuccess,
    uploadFile = uploadResumeFile,
}: ResumeUploadDialogProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const filePickerRef = useRef<HTMLButtonElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState("");
    const [targetRole, setTargetRole] = useState("");
    const [notes, setNotes] = useState("");
    const [fileError, setFileError] = useState("");
    const [formError, setFormError] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [phase, setPhase] = useState<UploadPhase>("idle");
    const [progress, setProgress] = useState(0);
    const [session, setSession] = useState<ResumeUploadInitiation | null>(null);
    const [fileUploaded, setFileUploaded] = useState(false);

    const isBusy = ["hashing", "starting", "uploading", "completing"].includes(phase);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (isOpen && !dialog.open) {
            dialog.showModal();
            filePickerRef.current?.focus();
        }
        if (!isOpen && dialog.open) dialog.close();
    }, [isOpen]);

    function resetSuccessfulUpload() {
        setFile(null);
        setName("");
        setTargetRole("");
        setNotes("");
        setFileError("");
        setFormError("");
        setIsDragging(false);
        setPhase("idle");
        setProgress(0);
        setSession(null);
        setFileUploaded(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function closeDialog() {
        if (isBusy) return;
        onClose();
    }

    function selectFile(nextFile: File | null) {
        if (session) return;
        const validationError = validateResumeFile(nextFile);
        setFileError(validationError ?? "");
        setFormError("");
        setFile(validationError ? null : nextFile);
        if (!validationError && nextFile && !name.trim()) {
            setName(resumeNameFromFilename(nextFile.name));
        }
    }

    function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        selectFile(event.target.files?.[0] ?? null);
    }

    function handleDrop(event: DragEvent<HTMLDivElement>) {
        event.preventDefault();
        setIsDragging(false);
        selectFile(event.dataTransfer.files?.[0] ?? null);
    }

    async function finishUpload(activeSession: ResumeUploadInitiation) {
        if (!file) return;
        try {
            setPhase("uploading");
            setFormError("");
            await uploadFile({
                file,
                headers: activeSession.requiredHeaders,
                onProgress: setProgress,
                url: activeSession.uploadUrl,
            });
            setFileUploaded(true);
        } catch (error) {
            setPhase("upload-error");
            setFormError(getResumeErrorMessage(error));
            return;
        }

        await verifyUpload(activeSession);
    }

    async function verifyUpload(activeSession: ResumeUploadInitiation) {
        try {
            setPhase("completing");
            setFormError("");
            const resume = await onComplete(activeSession.resume.id);
            onSuccess(resume);
            resetSuccessfulUpload();
            onClose();
        } catch (error) {
            setPhase("completion-error");
            setFormError(getResumeErrorMessage(error));

            const retryVerification =
                error instanceof Error &&
                "code" in error &&
                error.code === "RESUME_STORAGE_UNAVAILABLE";
            if (!retryVerification) {
                setSession(null);
                setFileUploaded(false);
                setProgress(0);
            }
        }
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (isBusy) return;

        if (phase === "upload-error" && session) {
            await finishUpload(session);
            return;
        }
        if (phase === "completion-error" && session && fileUploaded) {
            await verifyUpload(session);
            return;
        }

        const validationError = validateResumeFile(file);
        if (validationError) {
            setFileError(validationError);
            fileInputRef.current?.focus();
            return;
        }
        if (!name.trim()) {
            setFormError("Add a display name for this resume.");
            return;
        }
        if (name.trim().length > 150 || targetRole.trim().length > 150) {
            setFormError("Display name and target role must be 150 characters or less.");
            return;
        }
        if (notes.trim().length > 5000) {
            setFormError("Notes must be 5,000 characters or less.");
            return;
        }

        try {
            setFormError("");
            setFileError("");
            setProgress(0);
            setPhase("hashing");
            const checksum = await calculateChecksum(file!);
            setPhase("starting");
            const nextSession = await onInitiate({
                checksum,
                mimeType: "application/pdf",
                name: name.trim(),
                notes: notes.trim() || null,
                originalFilename: file!.name,
                sizeBytes: file!.size,
                targetRole: targetRole.trim() || null,
            });
            setSession(nextSession);
            await finishUpload(nextSession);
        } catch (error) {
            setPhase("idle");
            setFormError(getResumeErrorMessage(error));
        }
    }

    const actionLabel =
        phase === "upload-error"
            ? "Retry upload"
            : phase === "completion-error" && session && fileUploaded
              ? "Retry verification"
              : phaseLabel(phase, progress);

    return (
        <dialog
            ref={dialogRef}
            className="resume-dialog resume-upload-dialog"
            aria-labelledby="resume-upload-title"
            onCancel={(event) => {
                if (isBusy) event.preventDefault();
                else onClose();
            }}
            onClose={() => {
                if (isOpen) onClose();
            }}
        >
            <form method="dialog" onSubmit={submit}>
                <div className="resume-dialog-header">
                    <div>
                        <span className="resume-dialog-eyebrow">New version</span>
                        <h2 id="resume-upload-title">Upload a resume</h2>
                        <p>Add a PDF you can reuse across applications.</p>
                    </div>
                    <button
                        type="button"
                        className="resume-icon-button"
                        aria-label="Close resume upload"
                        disabled={isBusy}
                        onClick={closeDialog}
                    >
                        <AppIcon name="x" size={20} />
                    </button>
                </div>

                <div className="resume-dialog-body">
                    <div
                        className={`resume-dropzone${isDragging ? " is-dragging" : ""}${fileError ? " has-error" : ""}`}
                        onDragEnter={(event) => {
                            event.preventDefault();
                            if (!session) setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDrop}
                    >
                        <span className="resume-dropzone-icon" aria-hidden="true">
                            <AppIcon name={file ? "check" : "document"} size={25} />
                        </span>
                        {file ? (
                            <div className="resume-selected-file">
                                <strong>{file.name}</strong>
                                <span>{(file.size / (1024 * 1024)).toFixed(2)} MB · PDF</span>
                            </div>
                        ) : (
                            <div>
                                <strong>Drop your PDF here</strong>
                                <span>or choose a file from your device</span>
                            </div>
                        )}
                        <button
                            ref={filePickerRef}
                            type="button"
                            className="secondary resume-file-picker"
                            disabled={Boolean(session) || isBusy}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {file ? "Choose another" : "Choose PDF"}
                        </button>
                        <input
                            ref={fileInputRef}
                            className="resume-file-input"
                            type="file"
                            accept="application/pdf,.pdf"
                            aria-label="Choose resume PDF"
                            aria-describedby="resume-file-help resume-file-error"
                            disabled={Boolean(session) || isBusy}
                            onChange={handleFileChange}
                        />
                        <small id="resume-file-help">PDF only · Maximum 5 MB</small>
                    </div>
                    {fileError && (
                        <p id="resume-file-error" className="resume-field-error" role="alert">
                            {fileError}
                        </p>
                    )}

                    <div className="resume-form-grid">
                        <label className="resume-field resume-field-full">
                            <span>Display name</span>
                            <input
                                value={name}
                                maxLength={150}
                                disabled={Boolean(session) || isBusy}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Product manager — core"
                            />
                        </label>
                        <label className="resume-field resume-field-full">
                            <span>Target role <small>Optional</small></span>
                            <input
                                value={targetRole}
                                maxLength={150}
                                disabled={Boolean(session) || isBusy}
                                onChange={(event) => setTargetRole(event.target.value)}
                                placeholder="e.g. Senior Product Manager"
                            />
                        </label>
                        <label className="resume-field resume-field-full">
                            <span>Notes <small>Optional</small></span>
                            <textarea
                                value={notes}
                                maxLength={5000}
                                disabled={Boolean(session) || isBusy}
                                onChange={(event) => setNotes(event.target.value)}
                                placeholder="What makes this version distinct?"
                            />
                        </label>
                    </div>

                    <div className="resume-version-note">
                        <AppIcon name="info" size={17} />
                        <p>
                            Need to revise the PDF later? Upload the revised file as a new
                            version so application history stays accurate.
                        </p>
                    </div>

                    {(isBusy || progress > 0) && (
                        <div className="resume-upload-progress" aria-live="polite">
                            <div>
                                <span>{phaseLabel(phase, progress)}</span>
                                <strong>{phase === "uploading" ? `${progress}%` : ""}</strong>
                            </div>
                            <progress
                                aria-label="Resume upload progress"
                                max={100}
                                value={phase === "uploading" ? progress : undefined}
                            />
                        </div>
                    )}
                    {formError && (
                        <div className="resume-action-error" role="alert">
                            <AppIcon name="warning" size={18} />
                            <span>{formError}</span>
                        </div>
                    )}
                </div>

                <div className="resume-dialog-footer">
                    <button type="button" className="alternative" disabled={isBusy} onClick={closeDialog}>
                        Close
                    </button>
                    <button type="submit" className="primary" disabled={isBusy}>
                        {isBusy ? <span className="resume-button-spinner" aria-hidden="true" /> : <AppIcon name="plus" size={18} />}
                        <span>{actionLabel}</span>
                    </button>
                </div>
            </form>
        </dialog>
    );
}
