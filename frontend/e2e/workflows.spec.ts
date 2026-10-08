import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const api = "http://127.0.0.1:4100";
const password = "Browser-Test-Password-123!";

async function navigate(page: Page, name: string) {
    const toggle = page.getByRole("button", { name: "Open navigation menu", exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name, exact: true }).click();
}

async function signIn(page: Page) {
    const email = `browser-${randomUUID()}@example.test`;
    expect((await page.request.post(`${api}/auth/signup`, { data: { email, password } })).status()).toBe(201);
    expect((await page.request.post(`${api}/auth/verify-email`, { data: { email, otp: "123456" } })).ok()).toBeTruthy();
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect.poll(async () => (await page.request.get(`${api}/auth/me`)).status()).toBe(200);
    return email;
}

async function addApplication(page: Page, title: string) {
    await navigate(page, "Applications");
    await page.getByRole("button", { name: "Add application", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add application" });
    await dialog.getByLabel("Job title", { exact: false }).fill(title);
    await dialog.getByLabel("Company", { exact: true }).fill("Browser Test Co");
    await dialog.getByRole("button", { name: "Save application" }).click();
    await expect(dialog).not.toBeVisible();
    const response = await page.request.get(`${api}/applications`);
    return (await response.json()).applications.find((app: { title: string }) => app.title === title);
}

test("signup, invalid verification, recovery, login, reload and logout", async ({ page }) => {
    const email = `browser-${randomUUID()}@example.test`;
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("tab", { name: "Create account" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create my account" }).click();
    await page.getByLabel("Verification code").fill("000000");
    await page.getByRole("button", { name: "Verify email", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Invalid verification");
    await page.getByLabel("Verification code").fill("123456");
    await page.getByRole("button", { name: "Verify email", exact: true }).click();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByRole("button", { name: "Send reset code" }).click();
    await page.getByLabel("Recovery code").fill("654321");
    await page.getByLabel("New password", { exact: true }).fill(`${password}New`);
    await page.getByRole("button", { name: "Reset password", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill(`${password}New`);
    await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
    await expect.poll(async () => (await page.request.get(`${api}/auth/me`)).status()).toBe(200);
    const cookie = (await page.context().cookies()).find((entry) => entry.name === "jobhazel_session");
    expect(cookie?.httpOnly).toBe(true);
    await page.reload();
    await navigate(page, "Applications");
    await expect(page.getByRole("button", { name: "Add application", exact: true })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Open navigation menu", exact: true });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect.poll(async () => (await page.request.get(`${api}/auth/me`)).status()).toBe(401);
});

test("application create, edit, persistence and delete", async ({ page }) => {
    await signIn(page);
    const app = await addApplication(page, "Browser Engineer");
    await page.getByText("Browser Engineer", { exact: true }).first().click();
    await page.getByRole("button", { name: "Edit application", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit application" });
    await dialog.getByLabel("Job title", { exact: false }).fill("Senior Browser Engineer");
    await dialog.getByRole("button", { name: "Update application" }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await navigate(page, "Applications");
    await page.getByText("Senior Browser Engineer", { exact: true }).first().click();
    await page.getByRole("button", { name: "More application actions" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("menuitem", { name: /Delete application/ }).click();
    await expect.poll(async () => (await page.request.get(`${api}/applications/${app.id}`)).status()).toBe(404);
});

test("job description import is reviewed and persisted", async ({ page }) => {
    await signIn(page);
    await navigate(page, "Applications");
    await page.getByRole("button", { name: "Import job", exact: true }).click();
    const capture = page.getByRole("dialog", { name: "Import job", exact: true });
    await capture.getByPlaceholder("Paste the job description...").fill("Software Engineer at Example Labs\nRemote\nBuild reliable TypeScript applications. Salary: $120,000 - $150,000 per year.");
    await capture.getByRole("button", { name: "Create draft" }).click();
    const review = page.getByRole("dialog", { name: "Review import" });
    await review.getByLabel("Job title", { exact: false }).fill("Imported Engineer");
    await review.getByLabel("Company", { exact: true }).fill("Example Labs");
    await review.getByRole("button", { name: "Save application" }).click();
    await expect(review).not.toBeVisible();
    await expect.poll(async () => (await (await page.request.get(`${api}/applications`)).json()).applications.some((app: { title: string }) => app.title === "Imported Engineer")).toBe(true);
});

test("resume upload, application attachment and download", async ({ page }) => {
    await signIn(page);
    await navigate(page, "Resumes");
    await page.getByRole("button", { name: "Upload resume", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Upload a resume" });
    await dialog.getByLabel("Choose resume PDF").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n") });
    await dialog.getByLabel("Display name").fill("Browser resume");
    await dialog.getByRole("button", { name: "Upload resume", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await navigate(page, "Applications");
    await page.getByRole("button", { name: "Add application", exact: true }).click();
    const application = page.getByRole("dialog", { name: "Add application" });
    await application.getByLabel("Job title", { exact: false }).fill("Resume Engineer");
    await application.getByLabel("Resume", { exact: false }).selectOption({ label: "Browser resume" });
    const saveRequests: { url: string; body: Record<string, unknown> | null }[] = [];
    page.on("request", request => {
        if (["POST", "PUT"].includes(request.method()) && request.url().startsWith(`${api}/applications`)) saveRequests.push({ url: request.url(), body: request.postDataJSON() });
    });
    await application.getByRole("button", { name: "Save application" }).click();
    await expect(application).not.toBeVisible();
    const saved = (await (await page.request.get(`${api}/applications`)).json()).applications[0];
    expect(saved.resumeVersion.name).toBe("Browser resume");
    expect(saveRequests).toHaveLength(1);
    expect(saveRequests[0].url).toBe(`${api}/applications`);
    expect(saveRequests[0].body?.resumeVersionId).toBe(saved.resumeVersion.id);
    await page.getByText("Resume Engineer", { exact: true }).first().click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    expect(await (await download).failure()).toBeNull();
});

test("interview rescheduling persists and moves its automated thank-you task", async ({ page }) => {
    await signIn(page);
    const preferences = await page.request.patch(`${api}/tasks/preferences`, {
        headers: { Origin: "http://127.0.0.1:3100" },
        data: { autoCreateThankYouTasks: true, thankYouTaskDelayDays: 1 },
    });
    expect(preferences.ok()).toBeTruthy();
    const application = await addApplication(page, "Interview Engineer");
    await navigate(page, "Interviews");
    await page.getByRole("button", { name: "Add Interview", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Add interview" });
    await dialog.getByLabel("Application", { exact: false }).selectOption(application.id);
    await dialog.getByLabel("Date", { exact: false }).fill("2027-01-15");
    await dialog.getByLabel("Time", { exact: false }).fill("14:00");
    await dialog.getByRole("button", { name: "Save interview" }).click();
    await expect(dialog).not.toBeVisible();
    const before = (await (await page.request.get(`${api}/tasks`)).json()).tasks.find((task: { type: string }) => task.type === "THANK_YOU");
    expect(before).toBeDefined();
    await page.getByRole("button", { name: /Interview Engineer/ }).click();
    await page.getByRole("button", { name: "Edit interview", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit interview" });
    await edit.getByLabel("Date", { exact: false }).fill("2027-01-17");
    await edit.getByRole("button", { name: "Update interview" }).click();
    await expect(edit).not.toBeVisible();
    const afterTasks = (await (await page.request.get(`${api}/tasks`)).json()).tasks.filter((task: { type: string }) => task.type === "THANK_YOU");
    expect(afterTasks).toHaveLength(1);
    const after = afterTasks[0];
    expect(after.id).toBe(before.id);
    expect(Date.parse(after.dueDate) - Date.parse(before.dueDate)).toBe(2 * 86400000);
    await page.reload();
    const interviews = (await (await page.request.get(`${api}/interviews`)).json()).interviews;
    expect(interviews[0].scheduledAt).toContain("2027-01-17");
});
