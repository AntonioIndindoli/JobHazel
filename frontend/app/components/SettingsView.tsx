"use client";

import { useState, type KeyboardEvent } from "react";

import type { TaskAutomationPreferences } from "../lib/types";
import type { AccountActionResult } from "./AccountView";
import { AppIcon } from "./AppIcon";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationSettings } from "./NotificationSettings";

type SettingsViewProps = {
    token: string;
    preferences: TaskAutomationPreferences;
    onPreferenceChange: (
        preferences: Partial<TaskAutomationPreferences>,
    ) => Promise<AccountActionResult>;
};

type AutomationToggleKey =
    | "autoCreateFollowUpTasks"
    | "autoCreateThankYouTasks";
type AutomationDelayKey =
    | "followUpTaskDelayDays"
    | "thankYouTaskDelayDays";

type AutomationSettingProps = {
    checked: boolean;
    delayDays: number;
    disabled: boolean;
    label: string;
    description: string;
    onDelaySave: (value: string) => void | Promise<void>;
    onToggle: () => void | Promise<void>;
};

function AutomationSetting({
    checked,
    delayDays,
    disabled,
    label,
    description,
    onDelaySave,
    onToggle,
}: AutomationSettingProps) {
    const [delayDraft, setDelayDraft] = useState(String(delayDays));

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
        }
        if (event.key === "Escape") {
            setDelayDraft(String(delayDays));
        }
    }

    return (
        <div className="automation-setting-row">
            <span className="automation-setting-copy">
                <strong>{label}</strong>
                <small>{description}</small>
            </span>
            <span className="automation-setting-controls">
                <label className="automation-delay-field">
                    <span>Delay</span>
                    <span className="automation-delay-input">
                        <input
                            type="number"
                            min="0"
                            max="365"
                            step="1"
                            inputMode="numeric"
                            aria-label={`${label} delay in days`}
                            value={delayDraft}
                            disabled={disabled}
                            onChange={(event) => setDelayDraft(event.target.value)}
                            onBlur={() => void onDelaySave(delayDraft)}
                            onKeyDown={handleKeyDown}
                        />
                        <small>days</small>
                    </span>
                </label>
                <button
                    type="button"
                    role="switch"
                    aria-label={`Enable ${label}`}
                    aria-checked={checked}
                    className={checked ? "automation-switch active" : "automation-switch"}
                    disabled={disabled}
                    onClick={() => void onToggle()}
                >
                    <span className="account-switch-track" aria-hidden="true">
                        <span />
                    </span>
                </button>
            </span>
        </div>
    );
}

export function SettingsView({
    token,
    preferences,
    onPreferenceChange,
}: SettingsViewProps) {
    const [busyPreference, setBusyPreference] = useState<
        keyof TaskAutomationPreferences | null
    >(null);
    const [status, setStatus] = useState<AccountActionResult | null>(null);
    async function togglePreference(key: AutomationToggleKey) {
        setBusyPreference(key);
        setStatus(null);
        const result = await onPreferenceChange({ [key]: !preferences[key] });
        setStatus(result);
        setBusyPreference(null);
    }

    async function saveDelay(key: AutomationDelayKey, draft: string) {
        const value = Number(draft);
        if (!draft.trim() || !Number.isInteger(value) || value < 0 || value > 365) {
            setStatus({
                ok: false,
                message: "Enter a whole number of days between 0 and 365.",
            });
            return;
        }

        if (value === preferences[key]) {
            return;
        }

        setBusyPreference(key);
        setStatus(null);
        const result = await onPreferenceChange({ [key]: value });
        setStatus(result);
        setBusyPreference(null);
    }

    function renderAutomationSetting(
        label: string,
        description: string,
        toggleKey: AutomationToggleKey,
        delayKey: AutomationDelayKey,
    ) {
        const checked = preferences[toggleKey];

        return (
            <AutomationSetting
                key={`${delayKey}-${preferences[delayKey]}`}
                checked={checked}
                delayDays={preferences[delayKey]}
                disabled={busyPreference !== null}
                label={label}
                description={description}
                onDelaySave={(draft) => saveDelay(delayKey, draft)}
                onToggle={() => togglePreference(toggleKey)}
            />
        );
    }

    return (
        <section className="account-page settings-page">
            <div className="settings-content">
                <NotificationSettings key={token} token={token} />
                <article className="account-settings-card settings-card">
                    <div className="account-section-heading">
                        <span><AppIcon name="moon" size={19} /></span>
                        <div>
                            <h2>Appearance</h2>
                            <p>Choose how JobHazel looks on this device.</p>
                        </div>
                    </div>
                    <div className="account-switch-list">
                        <div className="automation-setting-row appearance-setting-row">
                            <span className="automation-setting-copy">
                                <strong>Dark mode</strong>
                                <small>Use darker colors throughout your workspace.</small>
                            </span>
                            <ThemeToggle />
                        </div>
                    </div>
                </article>
                <article className="account-settings-card settings-card">
                    <div className="account-section-heading">
                        <span><AppIcon name="checklist" size={19} /></span>
                        <div>
                            <h2>Task automation</h2>
                            <p>Choose which reminders JobHazel creates for you.</p>
                        </div>
                    </div>
                    <div className="account-switch-list">
                        {renderAutomationSetting(
                            "Application follow-ups",
                            "Create a follow-up task after an application is submitted.",
                            "autoCreateFollowUpTasks",
                            "followUpTaskDelayDays",
                        )}
                        {renderAutomationSetting(
                            "Interview thank-you notes",
                            "Create a thank-you task after a scheduled interview.",
                            "autoCreateThankYouTasks",
                            "thankYouTaskDelayDays",
                        )}
                    </div>
                    <p className="automation-delay-help">
                        Use 0 days to create the task on the same day.
                    </p>
                    {status && (
                        <p
                            className={
                                status.ok
                                    ? "account-feedback success"
                                    : "account-feedback error"
                            }
                            role="status"
                        >
                            {status.message}
                        </p>
                    )}
                </article>
            </div>
        </section>
    );
}
