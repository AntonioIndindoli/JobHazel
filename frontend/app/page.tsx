"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
    AccountView,
    type AccountActionResult,
} from "./components/AccountView";
import { AddInterviewButton } from "./components/AddInterviewButton";
import { AnalyticsView } from "./components/AnalyticsView";
import { AppIcon } from "./components/AppIcon";
import { ApplicationsView } from "./components/ApplicationsView";
import { ApplicationDrawer } from "./components/ApplicationDrawer";
import { DashboardShell } from "./components/DashboardShell";
import { ContactsView } from "./components/ContactsView";
import { ImportDrawer } from "./components/ImportDrawer";
import { ExtensionCaptureNotice } from "./components/ExtensionCaptureNotice";
import { InterviewDrawer } from "./components/InterviewDrawer";
import { InterviewsView } from "./components/InterviewsView";
import { LandingPage } from "./components/LandingPage";
import { ResumeLibraryView } from "./components/ResumeLibraryView";
import { ResumeUploadDialog } from "./components/ResumeUploadDialog";
import { SettingsView } from "./components/SettingsView";
import { TaskDrawer } from "./components/TaskDrawer";
import { TasksView } from "./components/TasksView";
import { DashboardHome } from "./components/dashboard/DashboardHome";
import {
    ANALYTICS_TIMEFRAME_OPTIONS,
    countActiveApplications,
    DEFAULT_ANALYTICS_TIMEFRAME,
    type AnalyticsTimeframeDays,
} from "./lib/application-analytics";
import { toLocalDateTimeInputs } from "./lib/interview-utils";
import { toTaskDueDateInput, toTaskDueDatePayload } from "./lib/task-utils";
import { getJobHazelExtensionId } from "./lib/extension-config";
import {
    CAPTURE_MAX_AGE_MS,
    ExtensionBridgeError,
    clearPendingExtensionCapture,
    getExtensionCaptureMessage,
    readPendingExtensionCapture,
    receiveExtensionCapture,
    removeCaptureParameter,
    type ExtensionJobCapture,
} from "./lib/extension-bridge";
import { setApplicationResume as updateApplicationResume } from "./lib/application-resume-api";
import {
    completeResumeUpload,
    createResumeDownloadUrl,
    getResumeErrorMessage,
    initiateResumeUpload,
    listResumes,
    permanentlyDeleteResume,
    updateResumeMetadata,
} from "./lib/resume-api";
import {
    ACCESS_TOKEN_KEY,
    APPLICATION_GOAL_PERIOD_OPTIONS,
    APPLICATION_GOAL_STORAGE_KEY,
    API_BASE_URL,
    DEFAULT_APPLICATION_GOAL,
    DEFAULT_WEEKLY_RANGE,
    EMPTY_APPLICATION_FORM,
    EMPTY_IMPORT_CAPTURE,
    EMPTY_INTERVIEW_FORM,
    EMPTY_IMPORT_REVIEW,
    EMPTY_TASK_FORM,
    INTERVIEW_OUTCOMES,
    INTERVIEW_TYPES,
    STATUSES,
    TASK_TYPES,
    USER_EMAIL_KEY,
} from "./lib/constants";
import type {
    ActivityLog,
    Application,
    ApplicationFilters,
    ApplicationGoalPeriod,
    ApplicationGoalSettings,
    ApplicationFormValues,
    AuthStatus,
    Contact,
    ContactFormValues,
    DashboardView,
    ImportDraft,
    ImportReviewValues,
    Interview,
    InterviewFormValues,
    Mode,
    ParserDebug,
    ResumeMetadataUpdate,
    ResumeUploadMetadata,
    ResumeVersion,
    Task,
    TaskAutomationPreferences,
    TaskFormValues,
    WeeklyRangeWeeks,
} from "./lib/types";

const INITIAL_FILTERS: ApplicationFilters = {
    query: "",
    status: "",
    source: "",
    company: "",
    timeframe: "",
};

function isApplicationGoalPeriod(value: unknown): value is ApplicationGoalPeriod {
    return APPLICATION_GOAL_PERIOD_OPTIONS.some((option) => option.value === value);
}

function normalizeApplicationGoalSettings(value: unknown): ApplicationGoalSettings {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { ...DEFAULT_APPLICATION_GOAL };
    }

    const candidate = value as { period?: unknown; target?: unknown };
    const target =
        typeof candidate.target === "number" && Number.isFinite(candidate.target)
            ? Math.max(1, Math.floor(candidate.target))
            : DEFAULT_APPLICATION_GOAL.target;
    const period = isApplicationGoalPeriod(candidate.period)
        ? candidate.period
        : DEFAULT_APPLICATION_GOAL.period;

    return { target, period };
}

function parseStoredApplicationGoal(rawGoal: string | null) {
    if (!rawGoal) return null;

    try {
        return normalizeApplicationGoalSettings(JSON.parse(rawGoal));
    } catch {
        return null;
    }
}

function getInitialApplicationGoal(): ApplicationGoalSettings {
    if (typeof window === "undefined") return { ...DEFAULT_APPLICATION_GOAL };

    try {
        return (
            parseStoredApplicationGoal(
                localStorage.getItem(APPLICATION_GOAL_STORAGE_KEY),
            ) ?? { ...DEFAULT_APPLICATION_GOAL }
        );
    } catch {
        return { ...DEFAULT_APPLICATION_GOAL };
    }
}

export default function MainPage() {
    const [kpiTimeframeDays, setKpiTimeframeDays] =
        useState<AnalyticsTimeframeDays>(DEFAULT_ANALYTICS_TIMEFRAME);
    const [mode, setMode] = useState<Mode>("signup");
    const [email, setEmail] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [userName, setUserName] = useState("");
    const [memberSince, setMemberSince] = useState("");
    const [password, setPassword] = useState("");
    const [token, setToken] = useState("");
    const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
    const [message, setMessage] = useState("");
    const [extensionCapture, setExtensionCapture] =
        useState<ExtensionJobCapture | null>(null);
    const [extensionCaptureNotice, setExtensionCaptureNotice] = useState<{
        kind: "info" | "error";
        message: string;
        retry: boolean;
    } | null>(null);
    const [extensionCaptureRetry, setExtensionCaptureRetry] = useState(0);
    const openedExtensionCaptureId = useRef<string | null>(null);
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const [applications, setApplications] = useState<Application[]>([]);
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [resumes, setResumes] = useState<ResumeVersion[]>([]);
    const [isResumeLibraryLoading, setIsResumeLibraryLoading] = useState(false);
    const [resumeLibraryError, setResumeLibraryError] = useState("");
    const [busyResumeId, setBusyResumeId] = useState<string | null>(null);
    const [isResumeUploadOpen, setIsResumeUploadOpen] = useState(false);
    const [contactCreateRequest, setContactCreateRequest] = useState(0);
    const [form, setForm] = useState<ApplicationFormValues>(EMPTY_APPLICATION_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isApplicationFormOpen, setIsApplicationFormOpen] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [interviewForm, setInterviewForm] =
        useState<InterviewFormValues>(EMPTY_INTERVIEW_FORM);
    const [interviewEditingId, setInterviewEditingId] = useState<string | null>(
        null,
    );
    const [isInterviewFormOpen, setIsInterviewFormOpen] = useState(false);
    const [interviewErrors, setInterviewErrors] = useState<Record<string, string>>(
        {},
    );
    const [taskForm, setTaskForm] = useState<TaskFormValues>(EMPTY_TASK_FORM);
    const [taskEditingId, setTaskEditingId] = useState<string | null>(null);
    const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
    const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
    const [taskPreferences, setTaskPreferences] =
        useState<TaskAutomationPreferences>({
            autoCreateFollowUpTasks: false,
            autoCreateThankYouTasks: false,
            followUpTaskDelayDays: 7,
            thankYouTaskDelayDays: 1,
        });
    const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
    const [importStep, setImportStep] = useState<"capture" | "review">("capture");
    const [importCapture, setImportCapture] = useState(EMPTY_IMPORT_CAPTURE);
    const [importReview, setImportReview] = useState(EMPTY_IMPORT_REVIEW);
    const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
    const [parserDebug, setParserDebug] = useState<ParserDebug | null>(null);
    const [importErrors, setImportErrors] = useState<Record<string, string>>({});
    const [importDuplicates, setImportDuplicates] = useState<Application[]>([]);
    const [isImportSubmitting, setIsImportSubmitting] = useState(false);
    const [filters, setFilters] = useState<ApplicationFilters>(INITIAL_FILTERS);
    const [historyByApp, setHistoryByApp] = useState<Record<string, ActivityLog[]>>(
        {},
    );
    const [openTimelineId, setOpenTimelineId] = useState<string | null>(null);
    const [weeklyRangeWeeks, setWeeklyRangeWeeks] =
        useState<WeeklyRangeWeeks>(DEFAULT_WEEKLY_RANGE);
    const [applicationGoal, setApplicationGoal] =
        useState<ApplicationGoalSettings>(getInitialApplicationGoal);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [currentView, setCurrentView] = useState<DashboardView>("dashboard");
    const [focusedApplicationId, setFocusedApplicationId] = useState<string | null>(
        null,
    );
    const [focusedInterviewId, setFocusedInterviewId] = useState<string | null>(
        null,
    );

    const accountName = useMemo(() => {
        if (userName.trim()) return userName.trim();
        const emailName = (userEmail || email).split("@")[0]?.split(/[._-]/)[0];
        return emailName
            ? emailName.charAt(0).toUpperCase() + emailName.slice(1)
            : "Account";
    }, [email, userEmail, userName]);

    const firstName = accountName.split(/\s+/)[0];

    const activePipeline = useMemo(
        () => countActiveApplications(applications),
        [applications],
    );

    const duplicateMatch = useMemo(
        () =>
            applications.find((app) => {
                if (editingId && app.id === editingId) return false;
                const sameTitle =
                    app.title.trim().toLowerCase() === form.title.trim().toLowerCase();
                const sameCompany =
                    (app.companyName ?? "").trim().toLowerCase() ===
                    form.companyName.trim().toLowerCase();
                const sameUrl =
                    form.sourceUrl.trim() &&
                    (app.sourceUrl ?? "").trim().toLowerCase() ===
                        form.sourceUrl.trim().toLowerCase();
                return (
                    form.title.trim() &&
                    (sameUrl || (sameTitle && sameCompany && form.companyName.trim()))
                );
            }),
        [applications, editingId, form.companyName, form.sourceUrl, form.title],
    );

    useEffect(() => {
        let ignore = false;

        async function loadExtensionCapture() {
            const captureId = new URL(window.location.href).searchParams.get("capture");
            try {
                let pendingCapture: ExtensionJobCapture | null = null;
                try {
                    pendingCapture = readPendingExtensionCapture();
                } catch (error) {
                    if (!captureId) throw error;
                }
                if (captureId && pendingCapture?.captureId !== captureId) {
                    setExtensionCaptureNotice({
                        kind: "info",
                        message: "Retrieving your captured job…",
                        retry: false,
                    });
                    const receipt = await receiveExtensionCapture(
                        captureId,
                        getJobHazelExtensionId(),
                    );
                    pendingCapture = receipt.capture;
                }

                if (ignore) return;
                if (captureId) removeCaptureParameter();
                if (!pendingCapture) return;
                setExtensionCapture(pendingCapture);
                setExtensionCaptureNotice({
                    kind: "info",
                    message: "Captured job received. Sign in if needed, then review the details.",
                    retry: false,
                });
            } catch (error) {
                if (ignore) return;
                if (
                    error instanceof ExtensionBridgeError &&
                    ["INVALID_CAPTURE_ID", "CAPTURE_EXPIRED", "CAPTURE_NOT_FOUND"].includes(
                        error.code,
                    )
                ) {
                    removeCaptureParameter();
                }
                setExtensionCaptureNotice({
                    kind: "error",
                    message: getExtensionCaptureMessage(error),
                    retry:
                        error instanceof ExtensionBridgeError &&
                        ["EXTENSION_UNAVAILABLE", "MESSAGE_TIMEOUT", "STORAGE_FAILED"].includes(
                            error.code,
                        ),
                });
            }
        }

        void loadExtensionCapture();
        return () => {
            ignore = true;
        };
    }, [extensionCaptureRetry]);

    useEffect(() => {
        if (!extensionCapture) return;

        if (authStatus === "signedOut") {
            setMode("login");
            setIsAuthOpen(true);
            setExtensionCaptureNotice({
                kind: "info",
                message: "Your captured job is ready. Sign in to review it.",
                retry: false,
            });
            return;
        }

        if (
            authStatus !== "signedIn" ||
            !token ||
            openedExtensionCaptureId.current === extensionCapture.captureId
        ) {
            return;
        }

        openedExtensionCaptureId.current = extensionCapture.captureId;
        setImportStep("capture");
        setImportCapture({
            sourceUrl: extensionCapture.sourceUrl,
            pageTitle: extensionCapture.pageTitle,
            rawText: extensionCapture.rawText,
        });
        setImportReview(EMPTY_IMPORT_REVIEW);
        setImportDraft(null);
        setParserDebug(null);
        setImportErrors({});
        setImportDuplicates([]);
        setIsImportSubmitting(false);
        setIsApplicationFormOpen(false);
        setIsInterviewFormOpen(false);
        setIsTaskFormOpen(false);
        setIsImportDrawerOpen(true);

        const wasTruncated = extensionCapture.warnings.some((warning) =>
            ["PAGE_TITLE_TRUNCATED", "SELECTED_TEXT_TRUNCATED"].includes(warning),
        );
        setExtensionCaptureNotice({
            kind: "info",
            message: wasTruncated
                ? "Captured job opened for review. Some captured text was shortened to fit import limits."
                : extensionCapture.warnings.includes("NO_TEXT_SELECTED")
                  ? "Captured URL and title opened for review. Add any missing job details before creating the draft."
                  : "Captured job opened for review.",
            retry: false,
        });
    }, [authStatus, extensionCapture, token]);

    useEffect(() => {
        if (!extensionCapture) return;
        const remaining = extensionCapture.createdAt + CAPTURE_MAX_AGE_MS - Date.now();

        function expireCapture() {
            clearPendingExtensionCapture();
            setExtensionCapture(null);
            openedExtensionCaptureId.current = null;
            setImportCapture(EMPTY_IMPORT_CAPTURE);
            setIsImportDrawerOpen(false);
            setExtensionCaptureNotice({
                kind: "error",
                message: "This capture expired. Return to the job posting and click the extension again.",
                retry: false,
            });
        }

        if (remaining <= 0) {
            expireCapture();
            return;
        }
        const timeout = window.setTimeout(expireCapture, remaining);
        return () => window.clearTimeout(timeout);
    }, [extensionCapture]);

    useEffect(() => {
        if (authStatus === "checking") return;
        if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
        else localStorage.removeItem(ACCESS_TOKEN_KEY);
    }, [authStatus, token]);

    useEffect(() => {
        if (authStatus === "checking") return;
        if (userEmail) localStorage.setItem(USER_EMAIL_KEY, userEmail);
        else localStorage.removeItem(USER_EMAIL_KEY);
    }, [authStatus, userEmail]);

    useEffect(() => {
        let ignore = false;

        async function verifySession() {
            const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
            const storedEmail = localStorage.getItem(USER_EMAIL_KEY) ?? "";

            if (storedToken) {
                const res = await fetch(`${API_BASE_URL}/auth/me`, {
                    headers: { Authorization: `Bearer ${storedToken}` },
                    credentials: "include",
                });
                if (ignore) return;

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    setToken(storedToken);
                    setUserEmail(data.user?.email ?? storedEmail);
                    setUserName(data.user?.name ?? "");
                    setMemberSince(data.user?.createdAt ?? "");
                    setAuthStatus("signedIn");
                    return;
                }
            }

            const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: "POST",
                credentials: "include",
            });
            if (ignore) return;

            if (refreshRes.ok) {
                const data = await refreshRes.json().catch(() => ({}));
                setToken(data.accessToken ?? "");
                setUserEmail(data.user?.email ?? "");
                setUserName(data.user?.name ?? "");
                setMemberSince(data.user?.createdAt ?? "");
                setAuthStatus(data.accessToken ? "signedIn" : "signedOut");
                return;
            }

            setToken("");
            setUserEmail("");
            setUserName("");
            setMemberSince("");
            setAuthStatus("signedOut");
        }

        verifySession().catch(() => {
            if (ignore) return;
            setToken("");
            setUserEmail("");
            setUserName("");
            setMemberSince("");
            setAuthStatus("signedOut");
        });

        return () => {
            ignore = true;
        };
    }, []);

    useEffect(() => {
        if (authStatus === "signedIn" && token) {
            loadApplications(token);
            loadInterviews(token);
            loadTasks(token);
            loadContacts(token);
            loadTaskAutomationPreferences(token);
            loadResumeLibrary(token);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus, token]);

    async function authSubmit(event: FormEvent) {
        event.preventDefault();
        const response = await fetch(`${API_BASE_URL}/auth/${mode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email, password }),
        });
        const data = await response.json();
        if (!response.ok) return setMessage(data.message ?? "Auth failed");
        setToken(data.accessToken);
        setUserEmail(data.user.email);
        setUserName(data.user.name ?? "");
        setMemberSince(data.user.createdAt ?? "");
        setAuthStatus("signedIn");
        setIsAuthOpen(false);
        setMessage(`Welcome ${data.user.email}`);
        loadApplications(data.accessToken);
        loadInterviews(data.accessToken);
        loadTasks(data.accessToken);
        loadContacts(data.accessToken);
        loadTaskAutomationPreferences(data.accessToken);
        loadResumeLibrary(data.accessToken);
    }

    async function signOut() {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            credentials: "include",
        }).catch(() => undefined);
        clearSession("Signed out successfully.");
    }

    function clearSession(nextMessage: string) {
        clearExtensionCaptureState();
        setToken("");
        setUserEmail("");
        setUserName("");
        setMemberSince("");
        setPassword("");
        setApplications([]);
        setInterviews([]);
        setTasks([]);
        setContacts([]);
        setResumes([]);
        setResumeLibraryError("");
        setIsResumeLibraryLoading(false);
        setBusyResumeId(null);
        setIsResumeUploadOpen(false);
        setTaskPreferences({
            autoCreateFollowUpTasks: false,
            autoCreateThankYouTasks: false,
            followUpTaskDelayDays: 7,
            thankYouTaskDelayDays: 1,
        });
        setHistoryByApp({});
        setOpenTimelineId(null);
        resetInterviewForm();
        resetTaskForm();
        resetImportFlow();
        setIsImportDrawerOpen(false);
        setIsInterviewFormOpen(false);
        setIsTaskFormOpen(false);
        setIsProfileMenuOpen(false);
        setCurrentView("dashboard");
        setAuthStatus("signedOut");
        setIsAuthOpen(false);
        setMessage(nextMessage);
    }

    async function authedFetch(
        path: string,
        init: RequestInit = {},
        activeToken = token,
    ) {
        const res = await fetch(`${API_BASE_URL}${path}`, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${activeToken}`,
                ...(init.headers || {}),
            },
            credentials: "include",
        });
        if (res.status === 401) {
            clearExtensionCaptureState();
            resetImportFlow();
            setIsImportDrawerOpen(false);
            setMessage("Unauthorized. Log in again.");
            setToken("");
            setUserEmail("");
            setUserName("");
            setMemberSince("");
            setAuthStatus("signedOut");
        }
        return res;
    }

    async function saveAccountProfile(values: {
        name: string;
        email: string;
    }): Promise<AccountActionResult> {
        try {
            const res = await authedFetch("/auth/profile", {
                method: "PATCH",
                body: JSON.stringify(values),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { ok: false, message: data.message ?? "Profile update failed." };
            }

            setToken(data.accessToken ?? token);
            setUserName(data.user?.name ?? values.name);
            setUserEmail(data.user?.email ?? values.email);
            setMemberSince(data.user?.createdAt ?? memberSince);
            return { ok: true, message: "Profile updated." };
        } catch {
            return { ok: false, message: "Could not connect to the server." };
        }
    }

    async function changeAccountPassword(values: {
        currentPassword: string;
        newPassword: string;
    }): Promise<AccountActionResult> {
        try {
            const res = await authedFetch("/auth/password", {
                method: "PATCH",
                body: JSON.stringify(values),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                return { ok: false, message: data.message ?? "Password update failed." };
            }

            setToken(data.accessToken ?? token);
            return { ok: true, message: "Password updated. Other sessions were signed out." };
        } catch {
            return { ok: false, message: "Could not connect to the server." };
        }
    }

    async function exportAccountData(
        format: "json" | "csv",
    ): Promise<AccountActionResult> {
        try {
            const res = await authedFetch(`/auth/export?format=${format}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: false, message: data.message ?? "Export failed." };
            }

            const blob = await res.blob();
            const disposition = res.headers.get("Content-Disposition") ?? "";
            const filename =
                disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
                `jobappledger-export.${format}`;
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(objectUrl);
            return { ok: true, message: `${filename} downloaded.` };
        } catch {
            return { ok: false, message: "Could not prepare your export." };
        }
    }

    async function deleteUserAccount(passwordConfirmation: string): Promise<AccountActionResult> {
        try {
            const res = await authedFetch("/auth/account", {
                method: "DELETE",
                body: JSON.stringify({ password: passwordConfirmation }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                return { ok: false, message: data.message ?? "Account deletion failed." };
            }

            clearSession("Your account and all associated data were deleted.");
            return { ok: true, message: "Account deleted." };
        } catch {
            return { ok: false, message: "Could not connect to the server." };
        }
    }

    async function loadApplications(activeToken = token) {
        if (!activeToken) return;
        const res = await fetch(`${API_BASE_URL}/applications`, {
            headers: { Authorization: `Bearer ${activeToken}` },
        });
        const data = await res.json();
        if (!res.ok)
            return setMessage(data.message ?? "Failed loading applications");
        setApplications(data.applications);
        loadApplicationHistories(activeToken);
    }

    async function loadInterviews(activeToken = token) {
        if (!activeToken) return;
        const res = await fetch(`${API_BASE_URL}/interviews`, {
            headers: { Authorization: `Bearer ${activeToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Failed loading interviews");
        setInterviews(data.interviews ?? []);
    }

    async function loadTasks(activeToken = token) {
        if (!activeToken) return;
        const res = await fetch(`${API_BASE_URL}/tasks`, {
            headers: { Authorization: `Bearer ${activeToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Failed loading tasks");
        setTasks(data.tasks ?? []);
    }

    async function loadContacts(activeToken = token) {
        if (!activeToken) return;
        const res = await fetch(`${API_BASE_URL}/contacts`, {
            headers: { Authorization: `Bearer ${activeToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Failed loading contacts");
        setContacts(data.contacts ?? []);
    }

    async function loadResumeLibrary(activeToken = token) {
        if (!activeToken) return;
        setIsResumeLibraryLoading(true);
        setResumeLibraryError("");
        try {
            const nextResumes = await listResumes((path, init) =>
                authedFetch(path, init, activeToken),
            );
            setResumes(nextResumes);
        } catch (error) {
            setResumeLibraryError(getResumeErrorMessage(error));
        } finally {
            setIsResumeLibraryLoading(false);
        }
    }

    async function beginResumeUpload(metadata: ResumeUploadMetadata) {
        return initiateResumeUpload((path, init) => authedFetch(path, init), metadata);
    }

    async function verifyResumeUpload(resumeId: string) {
        return completeResumeUpload((path, init) => authedFetch(path, init), resumeId);
    }

    function addCompletedResume(resume: ResumeVersion) {
        setResumes((current) => [
            resume,
            ...current.filter((candidate) => candidate.id !== resume.id),
        ]);
        setResumeLibraryError("");
        setMessage(`${resume.name} was added to your resume library.`);
    }

    async function updateResumeDetails(
        resume: ResumeVersion,
        update: ResumeMetadataUpdate,
    ) {
        setBusyResumeId(resume.id);
        try {
            const updatedResume = await updateResumeMetadata(
                (path, init) => authedFetch(path, init),
                resume.id,
                update,
            );
            setResumes((current) =>
                current.map((candidate) =>
                    candidate.id === updatedResume.id ? updatedResume : candidate,
                ),
            );
            setMessage("Resume details updated.");
        } catch (error) {
            throw new Error(getResumeErrorMessage(error));
        } finally {
            setBusyResumeId(null);
        }
    }

    async function changeResumeArchiveState(
        resume: ResumeVersion,
        archived: boolean,
    ) {
        setBusyResumeId(resume.id);
        try {
            const updatedResume = await updateResumeMetadata(
                (path, init) => authedFetch(path, init),
                resume.id,
                { archived },
            );
            setResumes((current) =>
                current.map((candidate) =>
                    candidate.id === updatedResume.id ? updatedResume : candidate,
                ),
            );
            setMessage(archived ? "Resume archived." : "Resume restored.");
            loadApplications();
        } catch (error) {
            setMessage(getResumeErrorMessage(error));
        } finally {
            setBusyResumeId(null);
        }
    }

    async function deleteResumePermanently(resume: ResumeVersion) {
        setBusyResumeId(resume.id);
        try {
            await permanentlyDeleteResume(
                (path, init) => authedFetch(path, init),
                resume.id,
            );
            setResumes((current) =>
                current.filter((candidate) => candidate.id !== resume.id),
            );
            setMessage("Resume permanently deleted.");
        } catch (error) {
            throw new Error(getResumeErrorMessage(error));
        } finally {
            setBusyResumeId(null);
        }
    }

    async function downloadResume(
        resume: Pick<ResumeVersion, "id" | "originalFilename">,
    ) {
        setBusyResumeId(resume.id);
        try {
            const downloadUrl = await createResumeDownloadUrl(
                (path, init) => authedFetch(path, init),
                resume.id,
            );
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setMessage(`Downloading ${resume.originalFilename}.`);
        } catch (error) {
            setMessage(getResumeErrorMessage(error));
        } finally {
            setBusyResumeId(null);
        }
    }

    async function saveContact(values: ContactFormValues, id?: string) {
        const payload = {
            ...values,
            role: values.role || null,
            email: values.email || null,
            linkedinUrl: values.linkedinUrl || null,
            notes: values.notes || null,
            companyName: values.companyName || null,
            applicationId: values.applicationId || null,
        };
        try {
            const res = await authedFetch(id ? `/contacts/${id}` : "/contacts", {
                method: id ? "PATCH" : "POST",
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, message: data.message ?? "Contact save failed." };
            setContacts((current) => id
                ? current.map((contact) => contact.id === id ? data.contact : contact)
                : [data.contact, ...current]);
            setMessage(id ? "Contact updated." : "Contact added.");
            return { ok: true };
        } catch {
            return { ok: false, message: "Could not connect to the server." };
        }
    }

    async function removeContact(id: string) {
        const res = await authedFetch(`/contacts/${id}`, { method: "DELETE" });
        if (!res.ok) return setMessage("Contact delete failed.");
        setContacts((current) => current.filter((contact) => contact.id !== id));
        setMessage("Contact deleted.");
    }

    async function loadTaskAutomationPreferences(activeToken = token) {
        if (!activeToken) return;
        const res = await fetch(`${API_BASE_URL}/tasks/preferences`, {
            headers: { Authorization: `Bearer ${activeToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
            return setMessage(data.message ?? "Failed loading task preferences");
        setTaskPreferences({
            autoCreateFollowUpTasks:
                data.preferences?.autoCreateFollowUpTasks ?? false,
            autoCreateThankYouTasks: data.preferences?.autoCreateThankYouTasks ?? false,
            followUpTaskDelayDays: data.preferences?.followUpTaskDelayDays ?? 7,
            thankYouTaskDelayDays: data.preferences?.thankYouTaskDelayDays ?? 1,
        });
    }

    async function loadApplicationHistories(activeToken = token) {
        if (!activeToken) return;
        const res = await fetch(`${API_BASE_URL}/applications/history`, {
            headers: { Authorization: `Bearer ${activeToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
            return setMessage(data.message ?? "Failed loading application history");
        setHistoryByApp(data.historyByApp ?? {});
    }

    async function loadHistory(id: string) {
        const res = await authedFetch(`/applications/${id}/history`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Failed loading history");
        setHistoryByApp((prev) => ({ ...prev, [id]: data.history }));
    }

    async function removeHistoryEvent(applicationId: string, activityLogId: string) {
        const res = await authedFetch(
            `/applications/${applicationId}/history/${activityLogId}`,
            { method: "DELETE" },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
            return setMessage(data.message ?? "History event delete failed");

        setHistoryByApp((prev) => ({
            ...prev,
            [applicationId]: (prev[applicationId] ?? []).filter(
                (entry) => entry.id !== activityLogId,
            ),
        }));
        setMessage("History event removed.");
    }

    function resetApplicationForm() {
        setForm(EMPTY_APPLICATION_FORM);
        setEditingId(null);
        setFormErrors({});
    }

    function openCreateApplication() {
        resetApplicationForm();
        setIsInterviewFormOpen(false);
        setIsTaskFormOpen(false);
        setIsImportDrawerOpen(false);
        setIsApplicationFormOpen(true);
    }

    function closeApplicationForm() {
        resetApplicationForm();
        setIsApplicationFormOpen(false);
    }

    function resetInterviewForm(applicationId = "") {
        setInterviewForm({ ...EMPTY_INTERVIEW_FORM, applicationId });
        setInterviewEditingId(null);
        setInterviewErrors({});
    }

    function resetTaskForm(applicationId = "") {
        setTaskForm({ ...EMPTY_TASK_FORM, applicationId });
        setTaskEditingId(null);
        setTaskErrors({});
    }

    function openCreateInterview(applicationId = "") {
        if (applications.length === 0) {
            setMessage("Add an application before scheduling an interview.");
            return;
        }

        const selectedApplicationId = applications.some(
            (application) => application.id === applicationId,
        )
            ? applicationId
            : "";

        resetInterviewForm(selectedApplicationId);
        setIsApplicationFormOpen(false);
        setIsTaskFormOpen(false);
        setIsImportDrawerOpen(false);
        setIsInterviewFormOpen(true);
    }

    function openCreateTask(applicationId = "") {
        const selectedApplicationId = applications.some(
            (application) => application.id === applicationId,
        )
            ? applicationId
            : "";

        resetTaskForm(selectedApplicationId);
        setIsApplicationFormOpen(false);
        setIsInterviewFormOpen(false);
        setIsImportDrawerOpen(false);
        setIsTaskFormOpen(true);
    }

    function viewApplication(applicationId: string) {
        setFocusedInterviewId(null);
        setFocusedApplicationId(applicationId);
        setCurrentView("applications");
    }

    function viewInterview(interviewId: string) {
        setFocusedInterviewId(interviewId);
        setCurrentView("interviews");
    }

    function changeCurrentView(view: DashboardView) {
        if (view === "interviews") setFocusedInterviewId(null);
        setCurrentView(view);
    }

    function updateApplicationGoal(nextGoal: ApplicationGoalSettings) {
        const normalizedGoal = normalizeApplicationGoalSettings(nextGoal);
        setApplicationGoal(normalizedGoal);

        try {
            localStorage.setItem(
                APPLICATION_GOAL_STORAGE_KEY,
                JSON.stringify(normalizedGoal),
            );
        } catch {
            // The UI should still update if browser storage is unavailable.
        }
    }

    function closeInterviewForm() {
        resetInterviewForm();
        setIsInterviewFormOpen(false);
    }

    function closeTaskForm() {
        resetTaskForm();
        setIsTaskFormOpen(false);
    }

    function resetImportFlow() {
        setImportStep("capture");
        setImportCapture(EMPTY_IMPORT_CAPTURE);
        setImportReview(EMPTY_IMPORT_REVIEW);
        setImportDraft(null);
        setParserDebug(null);
        setImportErrors({});
        setImportDuplicates([]);
        setIsImportSubmitting(false);
    }

    function clearExtensionCaptureState() {
        try {
            clearPendingExtensionCapture();
        } catch {
            // In-memory state is still cleared when browser storage is blocked.
        }
        setExtensionCapture(null);
        openedExtensionCaptureId.current = null;
        setExtensionCaptureNotice(null);
    }

    function openImportDrawer() {
        resetImportFlow();
        setIsApplicationFormOpen(false);
        setIsInterviewFormOpen(false);
        setIsTaskFormOpen(false);
        setIsImportDrawerOpen(true);
    }

    function closeImportDrawer() {
        resetImportFlow();
        setIsImportDrawerOpen(false);
        if (extensionCapture) clearExtensionCaptureState();
    }

    function buildImportReview(draft: ImportDraft): ImportReviewValues {
        return {
            title: draft.parsedTitle ?? "",
            companyName: draft.parsedCompany ?? "",
            status: "SAVED",
            source: draft.source ?? "",
            sourceUrl: draft.sourceUrl ?? "",
            location: draft.parsedLocation ?? "",
            salaryMin: draft.parsedSalaryMin ? String(draft.parsedSalaryMin) : "",
            salaryMax: draft.parsedSalaryMax ? String(draft.parsedSalaryMax) : "",
            description: draft.parsedDescription ?? "",
            notes: "",
            dateApplied: "",
        };
    }

    function validateApplicationForm() {
        const errors: Record<string, string> = {};
        if (!form.title.trim()) errors.title = "Job title is required.";
        if (form.sourceUrl.trim()) {
            try {
                new URL(form.sourceUrl);
            } catch {
                errors.sourceUrl = "Enter a valid URL, including https://.";
            }
        }
        if (form.dateApplied) {
            const selected = new Date(`${form.dateApplied}T00:00:00`);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selected > today)
                errors.dateApplied = "Date applied cannot be in the future.";
        }
        if (!STATUSES.includes(form.status as (typeof STATUSES)[number]))
            errors.status = "Choose a valid status.";
        const salaryMin = form.salaryMin.trim() ? Number(form.salaryMin) : null;
        const salaryMax = form.salaryMax.trim() ? Number(form.salaryMax) : null;
        if (salaryMin !== null && !Number.isInteger(salaryMin))
            errors.salaryMin = "Use whole dollars.";
        if (salaryMax !== null && !Number.isInteger(salaryMax))
            errors.salaryMax = "Use whole dollars.";
        if (
            salaryMin !== null &&
            salaryMax !== null &&
            Number.isInteger(salaryMin) &&
            Number.isInteger(salaryMax) &&
            salaryMin > salaryMax
        )
            errors.salaryMax = "Max must be greater than min.";
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    }

    function validateInterviewForm() {
        const errors: Record<string, string> = {};
        if (!interviewForm.applicationId) {
            errors.applicationId = "Choose an application.";
        } else if (
            !applications.some(
                (application) => application.id === interviewForm.applicationId,
            )
        ) {
            errors.applicationId = "Choose a valid application.";
        }

        if (
            !INTERVIEW_TYPES.includes(
                interviewForm.type as (typeof INTERVIEW_TYPES)[number],
            )
        )
            errors.type = "Choose a valid interview type.";

        if (!interviewForm.scheduledDate) {
            errors.scheduledDate = "Choose an interview date.";
        }
        if (!interviewForm.scheduledTime) {
            errors.scheduledTime = "Choose an interview time.";
        }
        if (interviewForm.scheduledDate && interviewForm.scheduledTime) {
            const scheduledAt = new Date(
                `${interviewForm.scheduledDate}T${interviewForm.scheduledTime}:00`,
            );
            if (Number.isNaN(scheduledAt.getTime()))
                errors.scheduledDate = "Choose a valid interview date and time.";
        }

        if (interviewForm.durationMinutes.trim()) {
            const durationMinutes = Number(interviewForm.durationMinutes);
            if (!Number.isInteger(durationMinutes)) {
                errors.durationMinutes = "Use whole minutes.";
            } else if (durationMinutes < 1 || durationMinutes > 1440) {
                errors.durationMinutes = "Duration must be between 1 and 1440 minutes.";
            }
        }

        if (interviewForm.meetingUrl.trim()) {
            try {
                const parsed = new URL(interviewForm.meetingUrl);
                if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
            } catch {
                errors.meetingUrl = "Enter a valid URL, including https://.";
            }
        }

        if (
            !INTERVIEW_OUTCOMES.includes(
                interviewForm.outcome as (typeof INTERVIEW_OUTCOMES)[number],
            )
        )
            errors.outcome = "Choose a valid outcome.";

        setInterviewErrors(errors);
        return Object.keys(errors).length === 0;
    }

    function validateTaskForm() {
        const errors: Record<string, string> = {};
        if (!taskForm.title.trim()) errors.title = "Task title is required.";

        if (
            taskForm.applicationId &&
            !applications.some(
                (application) => application.id === taskForm.applicationId,
            )
        ) {
            errors.applicationId = "Choose a valid application.";
        }

        if (!TASK_TYPES.includes(taskForm.type as (typeof TASK_TYPES)[number]))
            errors.type = "Choose a valid task type.";

        if (taskForm.dueDate) {
            const dueDate = new Date(`${taskForm.dueDate}T12:00:00`);
            if (Number.isNaN(dueDate.getTime()))
                errors.dueDate = "Choose a valid due date.";
        }

        setTaskErrors(errors);
        return Object.keys(errors).length === 0;
    }

    function buildInterviewPayload() {
        const scheduledAt = new Date(
            `${interviewForm.scheduledDate}T${interviewForm.scheduledTime}:00`,
        );

        return {
            applicationId: interviewForm.applicationId,
            type: interviewForm.type,
            scheduledAt: scheduledAt.toISOString(),
            durationMinutes: interviewForm.durationMinutes.trim()
                ? Number(interviewForm.durationMinutes)
                : null,
            location: interviewForm.location,
            meetingUrl: interviewForm.meetingUrl,
            interviewerName: interviewForm.interviewerName,
            notes: interviewForm.notes,
            outcome: interviewForm.outcome,
        };
    }

    function buildTaskPayload() {
        return {
            title: taskForm.title,
            description: taskForm.description,
            applicationId: taskForm.applicationId || null,
            dueDate: toTaskDueDatePayload(taskForm.dueDate),
            type: taskForm.type,
        };
    }

    function validateImportCapture() {
        const errors: Record<string, string> = {};
        const hasInput =
            importCapture.sourceUrl.trim() ||
            importCapture.pageTitle.trim() ||
            importCapture.rawText.trim();
        if (!hasInput) errors.rawText = "Add a job URL, page title, or description.";
        if (importCapture.sourceUrl.trim()) {
            try {
                new URL(importCapture.sourceUrl);
            } catch {
                errors.sourceUrl = "Enter a valid URL, including https://.";
            }
        }
        setImportErrors(errors);
        return Object.keys(errors).length === 0;
    }

    function validateImportReview() {
        const errors: Record<string, string> = {};
        if (!importReview.title.trim()) errors.title = "Job title is required.";
        if (!STATUSES.includes(importReview.status as (typeof STATUSES)[number]))
            errors.status = "Choose a valid status.";
        if (importReview.sourceUrl.trim()) {
            try {
                new URL(importReview.sourceUrl);
            } catch {
                errors.sourceUrl = "Enter a valid URL, including https://.";
            }
        }
        const salaryMin = importReview.salaryMin.trim()
            ? Number(importReview.salaryMin)
            : null;
        const salaryMax = importReview.salaryMax.trim()
            ? Number(importReview.salaryMax)
            : null;
        if (salaryMin !== null && !Number.isInteger(salaryMin))
            errors.salaryMin = "Use whole dollars.";
        if (salaryMax !== null && !Number.isInteger(salaryMax))
            errors.salaryMax = "Use whole dollars.";
        if (
            salaryMin !== null &&
            salaryMax !== null &&
            Number.isInteger(salaryMin) &&
            Number.isInteger(salaryMax) &&
            salaryMin > salaryMax
        )
            errors.salaryMax = "Max must be greater than min.";
        if (importReview.dateApplied) {
            const selected = new Date(`${importReview.dateApplied}T00:00:00`);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (selected > today)
                errors.dateApplied = "Date applied cannot be in the future.";
        }
        setImportErrors(errors);
        return Object.keys(errors).length === 0;
    }

    async function createImportDraft(event: FormEvent) {
        event.preventDefault();
        if (!validateImportCapture()) return;
        setIsImportSubmitting(true);
        const res = await authedFetch("/imports/create-draft", {
            method: "POST",
            body: JSON.stringify({ ...importCapture, debug: true }),
        });
        const data = await res.json().catch(() => ({}));
        setIsImportSubmitting(false);
        if (!res.ok) return setMessage(data.message ?? "Import failed");

        setImportDraft(data.importDraft);
        setImportReview(buildImportReview(data.importDraft));
        setParserDebug(data.debug ?? null);
        setImportDuplicates(data.duplicateCandidates ?? []);
        setImportErrors({});
        setImportStep("review");
        if (extensionCapture) clearExtensionCaptureState();
        setMessage(
            data.duplicateCandidates?.length
                ? "Possible duplicate found. Review before saving."
                : "Import draft ready.",
        );
    }

    async function convertImportDraft(event: FormEvent) {
        event.preventDefault();
        if (!importDraft || !validateImportReview()) return;
        setIsImportSubmitting(true);
        const payload = {
            ...importReview,
            salaryMin: importReview.salaryMin.trim()
                ? Number(importReview.salaryMin)
                : null,
            salaryMax: importReview.salaryMax.trim()
                ? Number(importReview.salaryMax)
                : null,
            dateApplied: importReview.dateApplied || null,
        };
        const res = await authedFetch(`/imports/${importDraft.id}/convert`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        setIsImportSubmitting(false);
        if (res.status === 409 && data.duplicates) {
            setImportDuplicates(data.duplicates);
            return setMessage("Possible duplicate detected. Save was blocked.");
        }
        if (!res.ok) return setMessage(data.message ?? "Import conversion failed");

        closeImportDrawer();
        setMessage("Imported job saved.");
        loadApplications();
        loadTasks();
    }

    async function saveApplication(event: FormEvent) {
        event.preventDefault();
        if (!validateApplicationForm()) return;
        const wasEditing = Boolean(editingId);
        const method = editingId ? "PUT" : "POST";
        const url = editingId ? `/applications/${editingId}` : "/applications";
        const { resumeVersionId, ...applicationFields } = form;
        const payload = {
            ...applicationFields,
            salaryMin: form.salaryMin.trim() ? Number(form.salaryMin) : null,
            salaryMax: form.salaryMax.trim() ? Number(form.salaryMax) : null,
            dateApplied: form.dateApplied || null,
        };
        const res = await authedFetch(url, {
            method,
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Save failed");

        const savedApplicationId = data.application?.id as string | undefined;
        if (!savedApplicationId) return setMessage("Application saved, but its response was incomplete.");

        try {
            await updateApplicationResume(
                (path, init) => authedFetch(path, init),
                savedApplicationId,
                resumeVersionId || null,
            );
        } catch (error) {
            resetApplicationForm();
            setIsApplicationFormOpen(false);
            setMessage(
                `Application saved, but the resume link was not updated. ${
                    error instanceof Error ? error.message : "Try editing the application again."
                }`,
            );
            loadApplications();
            loadResumeLibrary();
            return;
        }

        resetApplicationForm();
        setIsApplicationFormOpen(false);
        setMessage(
            form.status === "APPLIED" && !resumeVersionId
                ? `${wasEditing ? "Application updated" : "Application saved"} without a resume.`
                : wasEditing
                  ? "Application updated."
                  : "Application saved.",
        );
        loadApplications();
        loadTasks();
        loadResumeLibrary();
    }

    async function updateApplicationNotes(app: Application, notes: string) {
        const res = await authedFetch(`/applications/${app.id}`, {
            method: "PUT",
            body: JSON.stringify({
                title: app.title,
                companyName: app.companyName,
                status: app.status,
                source: app.source,
                sourceUrl: app.sourceUrl,
                location: app.location,
                salaryMin: app.salaryMin,
                salaryMax: app.salaryMax,
                description: app.description,
                notes,
                dateApplied: app.dateApplied,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setMessage(data.message ?? "Notes could not be saved.");
            throw new Error(data.message ?? "Notes could not be saved.");
        }
        setMessage("Notes updated.");
        await loadApplications();
    }

    async function saveInterview(event: FormEvent) {
        event.preventDefault();
        if (!validateInterviewForm()) return;

        const wasEditing = Boolean(interviewEditingId);
        const method = interviewEditingId ? "PATCH" : "POST";
        const url = interviewEditingId
            ? `/interviews/${interviewEditingId}`
            : "/interviews";
        const res = await authedFetch(url, {
            method,
            body: JSON.stringify(buildInterviewPayload()),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Interview save failed");

        closeInterviewForm();
        setMessage(wasEditing ? "Interview updated." : "Interview saved.");
        loadInterviews();
        loadApplications();
        loadTasks();
    }

    async function updateInterviewOutcome(id: string, outcome: string) {
        const res = await authedFetch(`/interviews/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ outcome }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Interview status update failed");
        setMessage("Interview status updated.");
        loadInterviews();
        loadApplications();
        loadTasks();
    }

    async function updateInterviewNotes(id: string, notes: string) {
        const res = await authedFetch(`/interviews/${id}`, { method: "PATCH", body: JSON.stringify({ notes }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMessage(data.message ?? "Interview notes could not be saved."); throw new Error(); }
        setMessage("Interview notes updated.");
        await loadInterviews();
    }

    async function updateTaskDescription(id: string, description: string) {
        const res = await authedFetch(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ description }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setMessage(data.message ?? "Task description could not be saved."); throw new Error(); }
        setMessage("Task description updated.");
        await loadTasks();
    }

    async function saveTask(event: FormEvent) {
        event.preventDefault();
        if (!validateTaskForm()) return;

        const wasEditing = Boolean(taskEditingId);
        const method = taskEditingId ? "PATCH" : "POST";
        const url = taskEditingId ? `/tasks/${taskEditingId}` : "/tasks";
        const res = await authedFetch(url, {
            method,
            body: JSON.stringify(buildTaskPayload()),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Task save failed");

        closeTaskForm();
        setMessage(wasEditing ? "Task updated." : "Task saved.");
        loadTasks();
        if (data.task?.applicationId) loadHistory(data.task.applicationId);
    }

    async function completeTask(id: string) {
        const res = await authedFetch(`/tasks/${id}/complete`, { method: "PATCH" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setMessage(data.message ?? "Task status update failed");

        setTasks((prev) => prev.map((task) => (task.id === id ? data.task : task)));
        setMessage(data.task?.completedAt ? "Task completed." : "Task marked not completed.");
        if (data.task?.applicationId) loadHistory(data.task.applicationId);
    }

    async function updateTaskAutomationPreferences(
        nextPreferences: Partial<TaskAutomationPreferences>,
    ): Promise<AccountActionResult> {
        const previousPreferences = taskPreferences;
        setTaskPreferences((current) => ({ ...current, ...nextPreferences }));
        try {
            const res = await authedFetch("/tasks/preferences", {
                method: "PATCH",
                body: JSON.stringify(nextPreferences),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setTaskPreferences(previousPreferences);
                const failureMessage = data.message ?? "Task preference update failed";
                setMessage(failureMessage);
                return { ok: false, message: failureMessage };
            }

            setTaskPreferences({
                autoCreateFollowUpTasks:
                    data.preferences?.autoCreateFollowUpTasks ?? false,
                autoCreateThankYouTasks:
                    data.preferences?.autoCreateThankYouTasks ?? false,
                followUpTaskDelayDays:
                    data.preferences?.followUpTaskDelayDays ?? 7,
                thankYouTaskDelayDays:
                    data.preferences?.thankYouTaskDelayDays ?? 1,
            });
            return { ok: true, message: "Automation preference updated." };
        } catch {
            setTaskPreferences(previousPreferences);
            return { ok: false, message: "Could not connect to the server." };
        }
    }

    async function transitionStatus(id: string, nextStatus: string) {
        const original = applications;
        const currentApplication = applications.find((app) => app.id === id);
        setApplications((prev) =>
            prev.map((app) => (app.id === id ? { ...app, status: nextStatus } : app)),
        );
        const res = await authedFetch(`/applications/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: nextStatus }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setApplications(original);
            return setMessage(data.message ?? "Failed to move card");
        }
        setApplications((prev) =>
            prev.map((app) => (app.id === id ? data.application : app)),
        );
        if (
            nextStatus === "APPLIED" &&
            !currentApplication?.resumeVersionId &&
            !currentApplication?.resumeVersion
        ) {
            setMessage("Application moved to Applied without a resume.");
        }
        loadHistory(id);
        loadTasks();
    }

    async function removeApplication(id: string) {
        const res = await authedFetch(`/applications/${id}`, { method: "DELETE" });
        if (!res.ok) return setMessage("Delete failed");
        if (editingId === id) closeApplicationForm();
        loadApplications();
        loadInterviews();
        loadTasks();
    }

    async function removeInterview(id: string) {
        const res = await authedFetch(`/interviews/${id}`, { method: "DELETE" });
        if (!res.ok) return setMessage("Interview delete failed");
        if (interviewEditingId === id) closeInterviewForm();
        setInterviews((prev) => prev.filter((interview) => interview.id !== id));
        setMessage("Interview deleted.");
    }

    async function removeTask(id: string) {
        const res = await authedFetch(`/tasks/${id}`, { method: "DELETE" });
        if (!res.ok) return setMessage("Task delete failed");
        if (taskEditingId === id) closeTaskForm();
        setTasks((prev) => prev.filter((task) => task.id !== id));
        setMessage("Task deleted.");
    }

    function startEdit(app: Application) {
        setEditingId(app.id);
        setFormErrors({});
        setForm({
            title: app.title,
            companyName: app.companyName ?? "",
            status: app.status,
            source: app.source ?? "",
            sourceUrl: app.sourceUrl ?? "",
            location: app.location ?? "",
            salaryMin: app.salaryMin === null ? "" : String(app.salaryMin),
            salaryMax: app.salaryMax === null ? "" : String(app.salaryMax),
            description: app.description ?? "",
            notes: app.notes ?? "",
            dateApplied: app.dateApplied ? app.dateApplied.slice(0, 10) : "",
            resumeVersionId: app.resumeVersion?.id ?? app.resumeVersionId ?? "",
        });
        setIsInterviewFormOpen(false);
        setIsTaskFormOpen(false);
        setIsImportDrawerOpen(false);
        setIsApplicationFormOpen(true);
    }

    function startEditInterview(interview: Interview) {
        const { scheduledDate, scheduledTime } = toLocalDateTimeInputs(
            interview.scheduledAt,
        );

        setInterviewEditingId(interview.id);
        setInterviewErrors({});
        setInterviewForm({
            applicationId: interview.applicationId,
            type: interview.type,
            scheduledDate,
            scheduledTime,
            durationMinutes: interview.durationMinutes
                ? String(interview.durationMinutes)
                : "",
            location: interview.location ?? "",
            meetingUrl: interview.meetingUrl ?? "",
            interviewerName: interview.interviewerName ?? "",
            notes: interview.notes ?? "",
            outcome: interview.outcome,
        });
        setIsApplicationFormOpen(false);
        setIsTaskFormOpen(false);
        setIsImportDrawerOpen(false);
        setIsInterviewFormOpen(true);
    }

    function startEditTask(task: Task) {
        setTaskEditingId(task.id);
        setTaskErrors({});
        setTaskForm({
            title: task.title,
            description: task.description ?? "",
            applicationId: task.applicationId ?? "",
            dueDate: toTaskDueDateInput(task.dueDate),
            type: task.type,
        });
        setIsApplicationFormOpen(false);
        setIsInterviewFormOpen(false);
        setIsImportDrawerOpen(false);
        setIsTaskFormOpen(true);
    }

    async function toggleTimeline(id: string) {
        const next = openTimelineId === id ? null : id;
        setOpenTimelineId(next);
        if (next && !historyByApp[id]) await loadHistory(id);
    }

    if (authStatus !== "signedIn" || !token)
        return (
            <>
                <LandingPage
                    mode={mode}
                    email={email}
                    password={password}
                    authStatus={authStatus}
                    message={message}
                    isAuthOpen={isAuthOpen}
                    onAuthClose={() => setIsAuthOpen(false)}
                    onAuthOpen={(nextMode) => {
                        setMode(nextMode);
                        setMessage("");
                        setIsAuthOpen(true);
                    }}
                    onModeChange={setMode}
                    onEmailChange={setEmail}
                    onPasswordChange={setPassword}
                    onSubmit={authSubmit}
                />
                {extensionCaptureNotice && (
                    <ExtensionCaptureNotice
                        kind={extensionCaptureNotice.kind}
                        message={extensionCaptureNotice.message}
                        onDismiss={() => setExtensionCaptureNotice(null)}
                        onRetry={
                            extensionCaptureNotice.retry
                                ? () => setExtensionCaptureRetry((retry) => retry + 1)
                                : undefined
                        }
                    />
                )}
            </>
        );

    return (
        <DashboardShell
            currentView={currentView}
            firstName={firstName}
            isProfileMenuOpen={isProfileMenuOpen}
            onCurrentViewChange={changeCurrentView}
            onImportOpen={openImportDrawer}
            onProfileMenuChange={setIsProfileMenuOpen}
            onSignOut={signOut}
            topbarPageControls={
                currentView === "dashboard" ? (
                    <>
                        <h1 className="topbar-page-title">Dashboard</h1>
                        <div className="topbar-page-actions">
                            <button
                                type="button"
                                className="primary"
                                aria-label="Import job"
                                onClick={openImportDrawer}
                            >
                                <AppIcon name="import" size={18} />
                                <span>Import Job</span>
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                aria-label="Add application"
                                onClick={openCreateApplication}
                            >
                                <AppIcon name="plus" size={18} />
                                <span>Add Application</span>
                            </button>
                        </div>
                    </>
                ) : currentView === "analytics" ? (
                    <>
                        <h1 className="topbar-page-title">Analytics</h1>
                        <div className="topbar-page-actions">
                            <label className="analytics-timeframe-control">
                                <span>Time frame</span>
                                <select
                                    aria-label="KPI time frame"
                                    value={kpiTimeframeDays}
                                    onChange={(event) =>
                                        setKpiTimeframeDays(
                                            Number(event.target.value) as AnalyticsTimeframeDays,
                                        )
                                    }
                                >
                                    {ANALYTICS_TIMEFRAME_OPTIONS.map((option) => (
                                        <option key={option.days} value={option.days}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    </>
                ) : currentView === "applications" ? (
                    <>
                        <h1 className="topbar-page-title">Applications</h1>
                        <div className="topbar-page-actions">
                            <button
                                type="button"
                                className="primary"
                                aria-label="Import job"
                                onClick={openImportDrawer}
                            >
                                <AppIcon name="import" size={18} />
                                <span>Import Job</span>
                            </button>
                            <button
                                type="button"
                                className="secondary"
                                aria-label="Add application"
                                onClick={openCreateApplication}
                            >
                                <AppIcon name="plus" size={18} />
                                <span>Add Application</span>
                            </button>
                        </div>
                    </>
                ) : currentView === "resumes" ? (
                    <>
                        <h1 className="topbar-page-title">Resumes</h1>
                        <div className="topbar-page-actions">
                            <button
                                type="button"
                                className="primary"
                                aria-label="Upload resume"
                                onClick={() => setIsResumeUploadOpen(true)}
                            >
                                <AppIcon name="plus" size={18} />
                                <span>Upload Resume</span>
                            </button>
                        </div>
                    </>
                ) : currentView === "interviews" ? (
                    <>
                        <h1 className="topbar-page-title">Interviews</h1>
                        <div className="topbar-page-actions">
                            <AddInterviewButton
                                className="primary"
                                iconSize={18}
                                onClick={() => openCreateInterview()}
                                disabled={applications.length === 0}
                            />
                        </div>
                    </>
                ) : currentView === "tasks" ? (
                    <>
                        <h1 className="topbar-page-title">Tasks &amp; Follow-Ups</h1>
                        <div className="topbar-page-actions">
                            <button
                                type="button"
                                className="primary"
                                aria-label="Create task"
                                onClick={() => openCreateTask()}
                            >
                                <AppIcon name="plus" size={18} />
                                <span>Create Task</span>
                            </button>
                        </div>
                    </>
                ) : currentView === "contacts" ? (
                    <>
                        <h1 className="topbar-page-title">Contacts</h1>
                        <div className="topbar-page-actions">
                            <button type="button" className="primary" aria-label="Add contact" onClick={() => setContactCreateRequest((request) => request + 1)}>
                                <AppIcon name="plus" size={18} />
                                <span>Add Contact</span>
                            </button>
                        </div>
                    </>
                ) : currentView === "settings" ? (
                    <h1 className="topbar-page-title">Settings</h1>
                ) : (
                    <h1 className="topbar-page-title">Account</h1>
                )
            }
        >
            {extensionCaptureNotice && (
                <ExtensionCaptureNotice
                    kind={extensionCaptureNotice.kind}
                    message={extensionCaptureNotice.message}
                    onDismiss={() => setExtensionCaptureNotice(null)}
                    onRetry={
                        extensionCaptureNotice.retry
                            ? () => setExtensionCaptureRetry((retry) => retry + 1)
                            : undefined
                    }
                />
            )}
            {currentView === "account" ? (
                <AccountView
                    activePipeline={activePipeline}
                    applicationCount={applications.length}
                    email={userEmail || email}
                    memberSince={memberSince}
                    name={accountName}
                    onDeleteAccount={deleteUserAccount}
                    onExport={exportAccountData}
                    onPasswordChange={changeAccountPassword}
                    onProfileSave={saveAccountProfile}
                    onReturnToDashboard={() => setCurrentView("dashboard")}
                    onSignOut={signOut}
                />
            ) : currentView === "settings" ? (
                <SettingsView
                    preferences={taskPreferences}
                    onPreferenceChange={updateTaskAutomationPreferences}
                />
            ) : currentView === "applications" ? (
                <ApplicationsView
                    applications={applications}
                    focusedApplicationId={focusedApplicationId}
                    interviews={interviews}
                    resumes={resumes}
                    tasks={tasks}
                    onCreateApplication={openCreateApplication}
                    onCreateInterview={openCreateInterview}
                    onCreateTask={openCreateTask}
                    onCompleteTask={completeTask}
                    onDownloadResume={downloadResume}
                    onRemoveApplication={removeApplication}
                    onRemoveInterview={removeInterview}
                    onStartEdit={startEdit}
                    onStartEditInterview={startEditInterview}
                    onStatusChange={transitionStatus}
                    onUpdateNotes={updateApplicationNotes}
                    onViewInterview={viewInterview}
                />
            ) : currentView === "resumes" ? (
                <ResumeLibraryView
                    busyResumeId={busyResumeId}
                    error={resumeLibraryError}
                    isLoading={isResumeLibraryLoading}
                    resumes={resumes}
                    onArchiveChange={changeResumeArchiveState}
                    onDelete={deleteResumePermanently}
                    onDownload={downloadResume}
                    onMetadataUpdate={updateResumeDetails}
                    onRetry={() => loadResumeLibrary()}
                    onUploadOpen={() => setIsResumeUploadOpen(true)}
                />
            ) : currentView === "analytics" ? (
                <AnalyticsView
                    applications={applications}
                    historyByApp={historyByApp}
                    interviews={interviews}
                    kpiTimeframeDays={kpiTimeframeDays}
                    weeklyRangeWeeks={weeklyRangeWeeks}
                    onViewApplication={viewApplication}
                    onWeeklyRangeChange={setWeeklyRangeWeeks}
                />
            ) : currentView === "interviews" ? (
                <InterviewsView
                    key={focusedInterviewId ?? "all-interviews"}
                    applications={applications}
                    focusedInterviewId={focusedInterviewId}
                    interviews={interviews}
                    onCreateInterview={() => openCreateInterview()}
                    onRemoveInterview={removeInterview}
                    onOutcomeChange={updateInterviewOutcome}
                    onUpdateNotes={updateInterviewNotes}
                    onStartEdit={startEditInterview}
                    onViewApplication={viewApplication}
                />
            ) : currentView === "tasks" ? (
                <TasksView
                    applications={applications}
                    tasks={tasks}
                    onCompleteTask={completeTask}
                    onCreateTask={openCreateTask}
                    onRemoveTask={removeTask}
                    onStartEdit={startEditTask}
                    onUpdateDescription={updateTaskDescription}
                    onViewApplication={viewApplication}
                />
            ) : currentView === "contacts" ? (
                <ContactsView
                    key={contactCreateRequest}
                    applications={applications}
                    contacts={contacts}
                    createRequest={contactCreateRequest}
                    onSave={saveContact}
                    onRemove={removeContact}
                />
            ) : (
                <DashboardHome
                    applicationGoal={applicationGoal}
                    applications={applications}
                    filters={filters}
                    historyByApp={historyByApp}
                    interviews={interviews}
                    openTimelineId={openTimelineId}
                    tasks={tasks}
                    onApplicationGoalChange={updateApplicationGoal}
                    onCreateInterview={openCreateInterview}
                    onCreateTask={() => openCreateTask()}
                    onFiltersChange={setFilters}
                    onRemoveApplication={removeApplication}
                    onRemoveHistoryEvent={removeHistoryEvent}
                    onStartEdit={startEdit}
                    onToggleTimeline={toggleTimeline}
                    onTransitionStatus={transitionStatus}
                    onViewApplications={() => {
                        setFocusedApplicationId(null);
                        changeCurrentView("applications");
                    }}
                    onViewApplication={viewApplication}
                    onViewInterviews={() => changeCurrentView("interviews")}
                    onViewTasks={() => changeCurrentView("tasks")}
                />
            )}

            {isApplicationFormOpen && (
                <ApplicationDrawer
                    duplicateMatch={duplicateMatch}
                    editingId={editingId}
                    form={form}
                    formErrors={formErrors}
                    resumes={resumes}
                    onClose={closeApplicationForm}
                    onFormChange={setForm}
                    onRemoveApplication={removeApplication}
                    onSubmit={saveApplication}
                />
            )}

            {isInterviewFormOpen && (
                <InterviewDrawer
                    applications={applications}
                    editingId={interviewEditingId}
                    form={interviewForm}
                    formErrors={interviewErrors}
                    onClose={closeInterviewForm}
                    onFormChange={setInterviewForm}
                    onRemoveInterview={removeInterview}
                    onSubmit={saveInterview}
                />
            )}

            {isTaskFormOpen && (
                <TaskDrawer
                    applications={applications}
                    editingId={taskEditingId}
                    form={taskForm}
                    formErrors={taskErrors}
                    onClose={closeTaskForm}
                    onFormChange={setTaskForm}
                    onRemoveTask={removeTask}
                    onSubmit={saveTask}
                />
            )}

            {isImportDrawerOpen && (
                <ImportDrawer
                    importCapture={importCapture}
                    importDraft={importDraft}
                    importDuplicates={importDuplicates}
                    importErrors={importErrors}
                    importReview={importReview}
                    importStep={importStep}
                    isImportSubmitting={isImportSubmitting}
                    parserDebug={parserDebug}
                    onCaptureChange={setImportCapture}
                    onClose={closeImportDrawer}
                    onCreateDraft={createImportDraft}
                    onReviewChange={setImportReview}
                    onReviewSubmit={convertImportDraft}
                    onStepChange={setImportStep}
                />
            )}

            <ResumeUploadDialog
                isOpen={isResumeUploadOpen}
                onClose={() => setIsResumeUploadOpen(false)}
                onComplete={verifyResumeUpload}
                onInitiate={beginResumeUpload}
                onSuccess={addCompletedResume}
            />
        </DashboardShell>
    );
}
