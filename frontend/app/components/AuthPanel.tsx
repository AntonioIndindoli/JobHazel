"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";

import { AppIcon } from "./AppIcon";
import type { AuthStatus, Mode } from "../lib/types";

type AuthPanelProps = {
    mode: Mode;
    email: string;
    password: string;
    authStatus: AuthStatus;
    message: string;
    canResendVerification?: boolean;
    onClose: () => void;
    onModeChange: (mode: Mode) => void;
    onEmailChange: (email: string) => void;
    onPasswordChange: (password: string) => void;
    onSubmit: (event: FormEvent) => void;
    onResendVerification?: () => void;
};

export function AuthPanel({
    mode,
    email,
    password,
    authStatus,
    message,
    canResendVerification = false,
    onClose,
    onModeChange,
    onEmailChange,
    onPasswordChange,
    onSubmit,
    onResendVerification,
}: AuthPanelProps) {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    useEffect(() => {
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }

        document.addEventListener("keydown", closeOnEscape);
        document.body.classList.add("auth-modal-open");
        return () => {
            document.removeEventListener("keydown", closeOnEscape);
            document.body.classList.remove("auth-modal-open");
        };
    }, [onClose]);

    const isChecking = authStatus === "checking";

    function changeMode(nextMode: Mode) {
        setIsPasswordVisible(false);
        onModeChange(nextMode);
    }

    return (
        <div className="auth-modal-backdrop" role="presentation" onMouseDown={onClose}>
            <section
                className="auth-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <button type="button" className="auth-close" aria-label="Close" onClick={onClose}>
                    <AppIcon name="x" size={20} />
                </button>
                <div className="auth-brand">
                <Image
                    src="/JobHazelIcon.png"
                    alt=""
                    width={42}
                    height={42}
                    priority
                />
                    <span>JobHazel</span>
                </div>
                <div className="auth-heading">
                    <h2 id="auth-title">{{ signup: "Start your job search", login: "Welcome back", forgot: "Reset your password", reset: "Choose a new password" }[mode]}</h2>
                    <p>{{ signup: "Create your free workspace in a few seconds.", login: "Sign in to pick up where you left off.", forgot: "We’ll email you a secure recovery link.", reset: "Enter a new password for your account." }[mode]}</p>
                </div>
                {(mode === "signup" || mode === "login") && <div className="auth-tabs" role="tablist" aria-label="Account action">
                    <button
                        type="button"
                        className={mode === "signup" ? "active" : ""}
                        role="tab"
                        aria-selected={mode === "signup"}
                        onClick={() => changeMode("signup")}
                    >
                        Create account
                    </button>
                    <button
                        type="button"
                        className={mode === "login" ? "active" : ""}
                        role="tab"
                        aria-selected={mode === "login"}
                        onClick={() => changeMode("login")}
                    >
                        Sign in
                    </button>
                </div>}
                <form onSubmit={onSubmit} className="auth-form">
                    {mode !== "reset" && <label>
                        <span>Email address</span>
                        <input
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(event) => onEmailChange(event.target.value)}
                            autoComplete="email"
                            autoFocus
                            required
                        />
                    </label>}
                    {mode !== "forgot" && <div className="auth-field">
                        <label htmlFor="auth-password">{mode === "reset" ? "New password" : "Password"}</label>
                        <span className="auth-password-control">
                            <input
                                id="auth-password"
                                type={isPasswordVisible ? "text" : "password"}
                                placeholder={mode === "signup" || mode === "reset" ? "Create a password" : "Enter your password"}
                                value={password}
                                onChange={(event) => onPasswordChange(event.target.value)}
                                autoComplete={mode === "signup" || mode === "reset" ? "new-password" : "current-password"}
                                required
                            />
                            <button
                                type="button"
                                className="auth-password-toggle"
                                aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                                aria-controls="auth-password"
                                aria-pressed={isPasswordVisible}
                                onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
                            >
                                <AppIcon name={isPasswordVisible ? "view-off" : "view"} size={19} />
                            </button>
                        </span>
                    </div>}
                    {mode === "login" && <button type="button" className="auth-text-action" onClick={() => changeMode("forgot")}>Forgot password?</button>}
                    <button className="auth-submit" disabled={isChecking}>
                        {isChecking ? "Please wait…" : { signup: "Create my account", login: "Sign in", forgot: "Send reset link", reset: "Reset password" }[mode]}
                        {!isChecking && <AppIcon name="arrow-right" size={18} />}
                    </button>
                    {message && <p className="auth-message" role="status">{message}</p>}
                    {canResendVerification && onResendVerification && <button type="button" className="auth-text-action auth-resend" onClick={onResendVerification}>Resend verification email</button>}
                </form>
                {(mode === "forgot" || mode === "reset") && <button type="button" className="auth-back" onClick={() => changeMode("login")}>Back to sign in</button>}
                <p className="auth-terms">By continuing, you agree to use JobHazel responsibly.</p>
            </section>
        </div>
    );
}
