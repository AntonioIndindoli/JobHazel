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
    onClose: () => void;
    onModeChange: (mode: Mode) => void;
    onEmailChange: (email: string) => void;
    onPasswordChange: (password: string) => void;
    onSubmit: (event: FormEvent) => void;
};

export function AuthPanel({
    mode,
    email,
    password,
    authStatus,
    message,
    onClose,
    onModeChange,
    onEmailChange,
    onPasswordChange,
    onSubmit,
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
                    <h2 id="auth-title">{mode === "signup" ? "Start your job search" : "Welcome back"}</h2>
                    <p>{mode === "signup" ? "Create your free workspace in a few seconds." : "Sign in to pick up where you left off."}</p>
                </div>
                <div className="auth-tabs" role="tablist" aria-label="Account action">
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
                </div>
                <form onSubmit={onSubmit} className="auth-form">
                    <label>
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
                    </label>
                    <div className="auth-field">
                        <label htmlFor="auth-password">Password</label>
                        <span className="auth-password-control">
                            <input
                                id="auth-password"
                                type={isPasswordVisible ? "text" : "password"}
                                placeholder={mode === "signup" ? "Create a password" : "Enter your password"}
                                value={password}
                                onChange={(event) => onPasswordChange(event.target.value)}
                                autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
                    </div>
                    <button className="auth-submit" disabled={isChecking}>
                        {isChecking ? "Checking your session…" : mode === "signup" ? "Create my account" : "Sign in"}
                        {!isChecking && <AppIcon name="arrow-right" size={18} />}
                    </button>
                    {message && <p className="auth-message" role="status">{message}</p>}
                </form>
                <p className="auth-terms">By continuing, you agree to use JobHazel responsibly.</p>
            </section>
        </div>
    );
}
