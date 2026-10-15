import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MainPage from "./page";

vi.mock("./components/DashboardShell", () => ({
    DashboardShell: ({ children, onCurrentViewChange, onSignOut }: {
        children: ReactNode;
        onCurrentViewChange: (view: string) => void;
        onSignOut: () => void;
    }) => <main>
        <button onClick={() => onCurrentViewChange("applications")}>Applications</button>
        <button onClick={onSignOut}>Sign out</button>
        {children}
    </main>,
}));

vi.mock("./components/LandingPage", () => ({
    LandingPage: ({ authStatus, onAuthOpen, onEmailChange, onSubmit }: {
        authStatus: string;
        onAuthOpen: (mode: string) => void;
        onEmailChange: (value: string) => void;
        onSubmit: (event: unknown) => void;
    }) => <form onSubmit={onSubmit}>
        <button type="button" onClick={() => onAuthOpen("login")}>Open sign in</button>
        <input aria-label="Email" onChange={(event) => onEmailChange(event.target.value)} />
        <button disabled={authStatus === "checking"}>Sign in</button>
    </form>,
}));

vi.mock("./components/dashboard/DashboardHome", () => ({
    DashboardHome: ({ applications }: { applications: { id: string; title: string }[] }) =>
        <section data-testid="dashboard">
            {applications.length ? applications.map((app) => <p key={app.id}>{app.title}</p>) : "No applications"}
        </section>,
}));

vi.mock("./components/ApplicationsView", () => ({
    ApplicationsView: () => <section>Applications list</section>,
}));

function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const user = { email: "person@example.com", name: "Person" };
const application = { id: "app-1", title: "Software Engineer" };

describe("initial workspace loading", () => {
    let pending: Record<string, ReturnType<typeof deferredResponse>>;
    let restoredSession: boolean;

    beforeEach(() => {
        localStorage.clear();
        restoredSession = true;
        pending = Object.fromEntries([
            "/applications", "/applications/history", "/interviews", "/tasks", "/contacts",
        ].map((path) => [path, deferredResponse()]));
        vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
            const path = new URL(String(input)).pathname.replace(/^\/api/, "");
            if (pending[path]) return pending[path].promise;
            if (path === "/auth/me") return Promise.resolve(json({ user }, restoredSession ? 200 : 401));
            if (path === "/auth/signup" || path === "/auth/login") return Promise.resolve(json({ user, accessToken: "session" }));
            if (path === "/auth/logout") return Promise.resolve(json({}));
            if (path === "/tasks/preferences") return Promise.resolve(json({ preferences: {} }));
            if (path === "/resumes") return Promise.resolve(json({ resumes: [] }));
            return Promise.resolve(json({}));
        }));
    });

    afterEach(() => vi.unstubAllGlobals());

    async function finishLoad(applications: unknown[] = [application]) {
        await act(async () => {
            pending["/applications"].resolve(json({ applications }));
            pending["/applications/history"].resolve(json({ historyByApp: {} }));
            pending["/interviews"].resolve(json({ interviews: [] }));
            pending["/tasks"].resolve(json({ tasks: [] }));
            pending["/contacts"].resolve(json({ contacts: [] }));
        });
    }

    it("hides empty data on session restoration until all data and dashboard history arrive", async () => {
        render(<MainPage />);
        expect(await screen.findByRole("status")).toBeTruthy();
        expect(screen.queryByTestId("dashboard")).toBeNull();

        await act(async () => {
            pending["/applications"].resolve(json({ applications: [application] }));
            pending["/interviews"].resolve(json({ interviews: [] }));
            pending["/tasks"].resolve(json({ tasks: [] }));
            pending["/contacts"].resolve(json({ contacts: [] }));
        });
        expect(screen.getByText("Loading your workspace…")).toBeTruthy();
        expect(screen.queryByTestId("dashboard")).toBeNull();

        await act(async () => pending["/applications/history"].resolve(json({ historyByApp: {} })));
        expect(await screen.findByText("Software Engineer")).toBeTruthy();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows loading immediately after signing in", async () => {
        restoredSession = false;
        render(<MainPage />);
        await waitFor(() => expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false));
        await userEvent.click(screen.getByRole("button", { name: "Open sign in" }));
        await userEvent.type(screen.getByLabelText("Email"), user.email);
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByText("Loading your workspace…")).toBeTruthy();
        expect(screen.queryByTestId("dashboard")).toBeNull();
        await finishLoad();
        expect(await screen.findByText("Software Engineer")).toBeTruthy();
    });

    it("keeps other data views in the loading state when navigating during the fetch", async () => {
        render(<MainPage />);
        await screen.findByRole("status");
        await userEvent.click(screen.getByRole("button", { name: "Applications" }));
        expect(screen.getByText("Loading your workspace…")).toBeTruthy();
        expect(screen.queryByText("Applications list")).toBeNull();
        await finishLoad();
        expect(await screen.findByText("Applications list")).toBeTruthy();
    });

    it.each(["http", "network"])("offers a retry for a %s failure without displaying an empty dashboard", async (failure) => {
        render(<MainPage />);
        await screen.findByRole("status");
        await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([input]) =>
            new URL(String(input)).pathname === "/tasks",
        )).toBe(true));
        await act(async () => {
            if (failure === "http") pending["/tasks"].resolve(json({ message: "Unavailable" }, 503));
            else pending["/tasks"].reject(new Error("Offline"));
        });
        await finishLoad();
        expect(await screen.findByRole("alert")).toBeTruthy();
        expect(screen.queryByTestId("dashboard")).toBeNull();
        pending = Object.fromEntries(Object.keys(pending).map((path) => [path, deferredResponse()]));
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(screen.getByRole("status")).toBeTruthy();
        await finishLoad();
        expect(await screen.findByText("Software Engineer")).toBeTruthy();
    });

    it("displays the genuine empty state only after a successful load", async () => {
        render(<MainPage />);
        await screen.findByRole("status");
        expect(screen.queryByText("No applications")).toBeNull();
        await finishLoad([]);
        expect(await screen.findByText("No applications")).toBeTruthy();
    });

    it("resets loading on a later sign-in and ignores requests from the previous session", async () => {
        render(<MainPage />);
        await screen.findByRole("status");
        const previousRequests = pending;
        await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await screen.findByRole("button", { name: "Sign in" });

        pending = Object.fromEntries(Object.keys(pending).map((path) => [path, deferredResponse()]));
        await userEvent.click(screen.getByRole("button", { name: "Open sign in" }));
        await userEvent.type(screen.getByLabelText("Email"), user.email);
        await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
        await screen.findByRole("status");
        await act(async () => {
            previousRequests["/applications"].resolve(json({ applications: [{ id: "old", title: "Old session job" }] }));
            previousRequests["/interviews"].resolve(json({ interviews: [] }));
            previousRequests["/tasks"].resolve(json({ tasks: [] }));
            previousRequests["/contacts"].resolve(json({ contacts: [] }));
        });
        expect(screen.queryByTestId("dashboard")).toBeNull();
        await finishLoad();
        expect(await screen.findByText("Software Engineer")).toBeTruthy();
        expect(screen.queryByText("Old session job")).toBeNull();
    });
});
