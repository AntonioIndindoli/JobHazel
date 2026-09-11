"use client";

import Image from "next/image";
import { useEffect, useRef, type ComponentProps, type PointerEvent } from "react";

import type { AuthStatus, Mode } from "../lib/types";
import { AppIcon } from "./AppIcon";
import { AuthPanel } from "./AuthPanel";
import { GrowingBranches } from "./GrowingBranches";
import { LandingProductStory } from "./LandingProductStory";
import { ThemeToggle } from "./ThemeToggle";

type LandingPageProps = {
    authStatus: AuthStatus;
    email: string;
    isAuthOpen: boolean;
    message: string;
    mode: Mode;
    password: string;
    onAuthClose: () => void;
    onAuthOpen: (mode: Mode) => void;
    onEmailChange: (email: string) => void;
    onModeChange: (mode: Mode) => void;
    onPasswordChange: (password: string) => void;
    onSubmit: ComponentProps<typeof AuthPanel>["onSubmit"];
};

export function LandingPage({
    authStatus,
    email,
    isAuthOpen,
    message,
    mode,
    password,
    onAuthClose,
    onAuthOpen,
    onEmailChange,
    onModeChange,
    onPasswordChange,
    onSubmit,
}: LandingPageProps) {
    const pageRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const page = pageRef.current;
        if (!page) return;

        const revealItems = Array.from(page.querySelectorAll<HTMLElement>("[data-reveal]"));
        page.classList.add("landing-motion-ready");

        if (!("IntersectionObserver" in window)) {
            revealItems.forEach((item) => item.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.16 },
        );

        revealItems.forEach((item) => observer.observe(item));
        return () => observer.disconnect();
    }, []);

    function movePreview(event: PointerEvent<HTMLDivElement>) {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width - 0.5;
        const y = (event.clientY - bounds.top) / bounds.height - 0.5;
        event.currentTarget.style.setProperty("--preview-x", `${x * 9}px`);
        event.currentTarget.style.setProperty("--preview-y", `${y * 7}px`);
        event.currentTarget.style.setProperty("--preview-rotate-x", `${y * -1.4}deg`);
        event.currentTarget.style.setProperty("--preview-rotate-y", `${x * 1.8 - 4}deg`);
    }

    function resetPreview(event: PointerEvent<HTMLDivElement>) {
        event.currentTarget.style.removeProperty("--preview-x");
        event.currentTarget.style.removeProperty("--preview-y");
        event.currentTarget.style.removeProperty("--preview-rotate-x");
        event.currentTarget.style.removeProperty("--preview-rotate-y");
    }

    return (
        <main className="landing-page" ref={pageRef}>
            <header className="landing-nav" aria-label="Primary navigation">
                <a className="landing-brand" href="#top" aria-label="JobHazel home">
                    <Image src="/JobHazelIcon.png" alt="" width={38} height={38} priority />
                    <span>JobHazel</span>
                </a>

                <nav className="landing-nav-links" aria-label="Landing page">

                </nav>

                <div className="landing-nav-actions">
                    <ThemeToggle variant="icon" />
                    <button type="button" className="landing-text-button" onClick={() => onAuthOpen("login")}>
                        Sign in
                    </button>
                    <button type="button" className="landing-button landing-button-small" onClick={() => onAuthOpen("signup")}>
                        Get started
                    </button>
                </div>
            </header>

            <section className="landing-hero" id="top">
                <GrowingBranches />
                <div className="landing-hero-copy landing-hero-entrance">
                    <h1>
                        Less tracking. More <span>growing.</span>
                    </h1>
                    <p>
                        JobHazel brings applications, interviews, contacts, and follow-ups together so you can focus on landing the right role.
                    </p>
                    <div className="landing-hero-actions">
                        <button type="button" className="landing-button" onClick={() => onAuthOpen("signup")}>
                            Start tracking for free
                            <AppIcon name="arrow-right" size={18} />
                        </button>
                    </div>
                    <div className="landing-proof">
                        <span><AppIcon name="check" size={15} /> Free to get started</span>
                        <span><AppIcon name="check" size={15} /> No credit card</span>
                    </div>
                </div>

                <div
                    className="landing-product-wrap"
                    aria-label="Preview of the JobHazel dashboard"
                    onPointerMove={movePreview}
                    onPointerLeave={resetPreview}
                >
                    <div className="landing-product">
                        <picture className="landing-product-picture">
                            <source
                                media="(max-width: 640px)"
                                type="image/avif"
                                srcSet="/landing/dashboard-preview-mobile-480.avif 480w, /landing/dashboard-preview-mobile-720.avif 720w"
                                sizes="calc(100vw - 32px)"
                                width="720"
                                height="480"
                            />
                            <source
                                media="(max-width: 640px)"
                                type="image/webp"
                                srcSet="/landing/dashboard-preview-mobile-480.webp 480w, /landing/dashboard-preview-mobile-720.webp 720w"
                                sizes="calc(100vw - 32px)"
                                width="720"
                                height="480"
                            />
                            <source
                                type="image/avif"
                                srcSet="/landing/dashboard-preview-960.avif 960w, /landing/dashboard-preview-1440.avif 1440w"
                                sizes="(max-width: 980px) 91vw, 50vw"
                                width="1440"
                                height="778"
                            />
                            <img
                                className="landing-product-frame"
                                src="/landing/dashboard-preview-960.webp"
                                srcSet="/landing/dashboard-preview-960.webp 960w, /landing/dashboard-preview-1440.webp 1440w"
                                sizes="(max-width: 980px) 91vw, 50vw"
                                width="1440"
                                height="778"
                                alt="JobHazel dashboard showing an application flow, job-search metrics, and application tracker"
                                fetchPriority="high"
                                decoding="async"
                            />
                        </picture>
                    </div>
                </div>
            </section>

            <LandingProductStory onGetStarted={() => onAuthOpen("signup")} />

            {isAuthOpen && (
                <AuthPanel
                    mode={mode}
                    email={email}
                    password={password}
                    authStatus={authStatus}
                    message={message}
                    onClose={onAuthClose}
                    onModeChange={onModeChange}
                    onEmailChange={onEmailChange}
                    onPasswordChange={onPasswordChange}
                    onSubmit={onSubmit}
                />
            )}
        </main>
    );
}
