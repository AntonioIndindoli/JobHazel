"use client";

import { useEffect, useState } from "react";

import { AppIcon } from "./AppIcon";

type ColorTheme = "light" | "dark";

export function ThemeToggle({ variant = "switch" }: { variant?: "switch" | "icon" }) {
    const [theme, setTheme] = useState<ColorTheme>("light");

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            setTheme(
                document.documentElement.dataset.theme === "dark" ? "dark" : "light",
            );
        });

        return () => window.cancelAnimationFrame(frame);
    }, []);

    function toggleTheme() {
        const nextTheme: ColorTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        document.documentElement.dataset.theme = nextTheme;

        try {
            localStorage.setItem("jobhazel-theme", nextTheme);
        } catch {
            // The selected theme still applies for this session if storage is unavailable.
        }
    }

    return (
        <button
            type="button"
            role="switch"
            className={variant === "icon" ? "landing-theme-toggle" : theme === "dark" ? "appearance-switch active" : "appearance-switch"}
            aria-label="Dark mode"
            aria-checked={theme === "dark"}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={toggleTheme}
        >
            {variant === "icon" ? (
                <AppIcon name={theme === "dark" ? "sun" : "moon"} size={20} />
            ) : (
                <span className="account-switch-track" aria-hidden="true">
                    <span />
                </span>
            )}
        </button>
    );
}
