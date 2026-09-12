import crypto from "crypto";
import { getPrismaAsync } from "../db/prisma.js";
import { env } from "../config/env.js";
import { getResumeStorage } from "./resume-storage.services.js";
import { sendAccountEmail } from "./email.services.js";

const SALT_BYTES = 16;
const KEYLEN = 64;
const DIGEST = "sha512";
const ITERATIONS = 120000;
const REFRESH_TOKEN_BYTES = 48;
const AUTH_TOKEN_BYTES = 32;
const SAFE_USER_SELECT = { id: true, name: true, email: true, emailVerifiedAt: true, createdAt: true };
export const ACCOUNT_RESUME_VERSION_SELECT = Object.freeze({
  id: true,
  name: true,
  targetRole: true,
  originalFilename: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  uploadStatus: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
});
export const ACCOUNT_LIMIT = 1000;
export const ACCOUNT_LIMIT_MESSAGE = "Account creation is unavailable because JobHazel has reached its 1,000-account limit.";

function hashPassword(password, salt = crypto.randomBytes(SALT_BYTES).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex");
  return `${ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [iterationsRaw, salt, originalHash] = stored.split(":");
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !originalHash) return false;

  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(originalHash, "hex"));
}

function signAccessToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + parseAccessTtlSeconds();
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, name: user.name ?? null, exp })).toString("base64url");
  const signature = crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function parseAccessTtlSeconds() {
  const ttl = env.ACCESS_TOKEN_TTL;
  const [, valueRaw, unit] = ttl.match(/^(\d+)([smhd])$/) ?? [];
  const value = Number(valueRaw);
  if (!value || !unit) return 15 * 60;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashAuthToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createAuthToken(prisma, userId, purpose, ttlMinutes) {
  const token = crypto.randomBytes(AUTH_TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await prisma.$transaction([
    prisma.authToken.deleteMany({ where: { userId, purpose, usedAt: null } }),
    prisma.authToken.create({ data: { userId, purpose, tokenHash: hashAuthToken(token), expiresAt } }),
  ]);
  return token;
}

async function sendVerificationEmail(user, prisma, sendEmail = sendAccountEmail) {
  const token = await createAuthToken(prisma, user.id, "EMAIL_VERIFICATION", 24 * 60);
  await sendEmail({
    to: user.email,
    subject: "Verify your JobHazel email",
    heading: "Verify your email",
    copy: "Confirm this email address to finish creating your JobHazel account. This link expires in 24 hours.",
    actionLabel: "Verify email",
    actionUrl: `${env.APP_URL}/?verify=${encodeURIComponent(token)}`,
  });
}

function buildExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
}

export async function issueSession(user, prismaOverride) {
  const prisma = prismaOverride ?? await getPrismaAsync();
  const refreshToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  const expiresAt = buildExpiryDate();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    },
  });

  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken,
    refreshTokenExpiresAt: expiresAt,
  };
}

export function verifyAccessToken(token) {
  const [header, payload, signature] = String(token || "").split(".");
  if (!header || !payload || !signature) throw new Error("Malformed token");
  const expected = crypto.createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${header}.${payload}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid signature");

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired token");
  return parsed;
}

export async function signup({ name, email, password }, prismaOverride, overrides = {}) {
  const prisma = prismaOverride ?? await getPrismaAsync();
  const passwordHash = hashPassword(password);

  const result = await prisma.$transaction(async (transaction) => {
    // Serialize the count-and-create section so concurrent signups cannot exceed the cap.
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(734901, 1)::text AS locked`;

    const existing = await transaction.user.findUnique({ where: { email } });
    if (existing) {
      return { status: 409, body: { message: "Email already in use." } };
    }

    const accountCount = await transaction.user.count();
    if (accountCount >= ACCOUNT_LIMIT) {
      return { status: 409, body: { message: ACCOUNT_LIMIT_MESSAGE } };
    }

    const user = await transaction.user.create({
      data: { name: name?.trim() || null, email, passwordHash },
      select: SAFE_USER_SELECT,
    });

    return { user };
  });

  if (!result.user) return result;

  await sendVerificationEmail(result.user, prisma, overrides.sendEmail);
  return {
    status: 201,
    body: { message: "Check your email to verify your account before signing in.", email: result.user.email },
  };
}

export async function login({ email, password }) {
  const prisma = await getPrismaAsync();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { status: 401, body: { message: "Invalid credentials." } };
  }

  if (!user.emailVerifiedAt) {
    return { status: 403, body: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email before signing in." } };
  }

  const safeUser = { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
  const session = await issueSession(safeUser);
  return { status: 200, body: session };
}

export async function refreshSession(rawRefreshToken) {
  if (!rawRefreshToken) return { status: 401, body: { message: "Refresh token missing." } };

  const prisma = await getPrismaAsync();
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(rawRefreshToken) },
    include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
  });

  if (!refreshToken || refreshToken.revokedAt || refreshToken.expiresAt < new Date()) {
    return { status: 401, body: { message: "Invalid refresh token." } };
  }

  await prisma.refreshToken.update({ where: { id: refreshToken.id }, data: { revokedAt: new Date() } });
  const session = await issueSession(refreshToken.user);
  return { status: 200, body: session };
}

export async function revokeSession(rawRefreshToken) {
  if (!rawRefreshToken) return;
  const prisma = await getPrismaAsync();
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawRefreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function loginExtension(credentials) {
  const result = await login(credentials);
  return result;
}

export async function getAccountUser(userId) {
  const prisma = await getPrismaAsync();
  return prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT });
}

export async function updateProfile(userId, payload) {
  const prisma = await getPrismaAsync();

  if (payload.email) {
    const existing = await prisma.user.findUnique({ where: { email: payload.email }, select: { id: true } });
    if (existing && existing.id !== userId) {
      return { status: 409, body: { message: "Email already in use." } };
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: payload,
    select: SAFE_USER_SELECT,
  });

  return { status: 200, body: { user, accessToken: signAccessToken(user) } };
}

export async function changePassword(userId, currentPassword, newPassword) {
  const prisma = await getPrismaAsync();
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return { status: 400, body: { message: "Current password is incorrect." } };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(newPassword) } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
  const session = await issueSession(safeUser);
  return { status: 200, body: session };
}

export async function resendVerification(email, overrides = {}) {
  const prisma = overrides.prisma ?? await getPrismaAsync();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerifiedAt) {
    await sendVerificationEmail(user, prisma, overrides.sendEmail);
  }
  return { status: 200, body: { message: "If that account still needs verification, a new link has been sent." } };
}

export async function verifyEmail(rawToken, overrides = {}) {
  const prisma = overrides.prisma ?? await getPrismaAsync();
  const token = await prisma.authToken.findUnique({ where: { tokenHash: hashAuthToken(rawToken) } });
  if (!token || token.purpose !== "EMAIL_VERIFICATION" || token.usedAt || token.expiresAt < new Date()) {
    return { status: 400, body: { message: "This verification link is invalid or has expired." } };
  }

  const user = await prisma.$transaction(async (tx) => {
    const consumed = await tx.authToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return null;
    return tx.user.update({
      where: { id: token.userId },
      data: { emailVerifiedAt: new Date() },
      select: SAFE_USER_SELECT,
    });
  });
  if (!user) return { status: 400, body: { message: "This verification link has already been used." } };
  return { status: 200, body: { message: "Email verified. You can now sign in." } };
}

export async function requestPasswordReset(email, overrides = {}) {
  const prisma = overrides.prisma ?? await getPrismaAsync();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.emailVerifiedAt) {
    const token = await createAuthToken(prisma, user.id, "PASSWORD_RESET", 60);
    await (overrides.sendEmail ?? sendAccountEmail)({
      to: user.email,
      subject: "Reset your JobHazel password",
      heading: "Reset your password",
      copy: "Use this secure link to choose a new password. This link expires in one hour.",
      actionLabel: "Reset password",
      actionUrl: `${env.APP_URL}/?reset=${encodeURIComponent(token)}`,
    });
  }
  return { status: 200, body: { message: "If an account exists for that email, a reset link has been sent." } };
}

export async function resetPassword(rawToken, newPassword, overrides = {}) {
  const prisma = overrides.prisma ?? await getPrismaAsync();
  const token = await prisma.authToken.findUnique({ where: { tokenHash: hashAuthToken(rawToken) } });
  if (!token || token.purpose !== "PASSWORD_RESET" || token.usedAt || token.expiresAt < new Date()) {
    return { status: 400, body: { message: "This password reset link is invalid or has expired." } };
  }

  const changed = await prisma.$transaction(async (tx) => {
    const consumed = await tx.authToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: token.userId }, data: { passwordHash: hashPassword(newPassword) } });
    await tx.refreshToken.updateMany({ where: { userId: token.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return true;
  });
  return changed
    ? { status: 200, body: { message: "Password reset. You can now sign in." } }
    : { status: 400, body: { message: "This password reset link has already been used." } };
}

export async function deleteAccount(userId, password, overrides = {}) {
  const prisma = overrides.prisma ?? (await getPrismaAsync());
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { status: 400, body: { message: "Password is incorrect." } };
  }

  return prisma.$transaction(async (tx) => {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    }

    const resumeObjects = await tx.resumeVersion.findMany({
      where: { userId },
      select: { id: true, storageKey: true },
    });
    let failedCleanupCount = 0;

    if (resumeObjects.length > 0) {
      let storage;
      try {
        storage = overrides.storage ?? getResumeStorage();
      } catch {
        failedCleanupCount = resumeObjects.length;
      }

      if (storage) {
        for (const resume of resumeObjects) {
          try {
            // R2 DeleteObject is idempotent, so retrying is safe when an
            // earlier attempt deleted only some objects.
            await storage.deleteObject(resume.storageKey);
          } catch {
            failedCleanupCount += 1;
          }
        }
      }
    }

    if (failedCleanupCount > 0) {
      console.info(
        "[resume-maintenance]",
        JSON.stringify({
          operation: "account-delete",
          status: "storage-cleanup-failed",
          objectCount: resumeObjects.length,
          failedCleanupCount,
        }),
      );
      return {
        status: 503,
        body: {
          code: "ACCOUNT_STORAGE_CLEANUP_FAILED",
          message: "Your account was not deleted because private file cleanup did not finish. Try again.",
        },
      };
    }

    await tx.user.delete({ where: { id: userId } });
    return { status: 204, body: null };
  });
}

export async function buildAccountExport(userId) {
  const prisma = await getPrismaAsync();
  const [user, companies, applications, contacts, interviews, tasks, resumeVersions, importDrafts, activityLogs] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          autoCreateFollowUpTasks: true,
          autoCreateThankYouTasks: true,
          followUpTaskDelayDays: true,
          thankYouTaskDelayDays: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.company.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.application.findMany({
        where: { userId },
        include: {
          company: { select: { name: true } },
          resumeVersion: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.contact.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.interview.findMany({ where: { userId }, orderBy: { scheduledAt: "asc" } }),
      prisma.task.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.resumeVersion.findMany({
        where: { userId },
        select: ACCOUNT_RESUME_VERSION_SELECT,
        orderBy: { createdAt: "asc" },
      }),
      prisma.importDraft.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.activityLog.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    companies,
    applications,
    contacts,
    interviews,
    tasks,
    resumeVersions,
    importDrafts,
    activityLogs,
  };
}

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const normalized = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(normalized) ? `"${normalized.replaceAll('"', '""')}"` : normalized;
}

export function createApplicationsCsv(applications) {
  const columns = [
    ["title", (application) => application.title],
    ["company", (application) => application.company?.name],
    ["status", (application) => application.status],
    ["source", (application) => application.source],
    ["source_url", (application) => application.sourceUrl],
    ["location", (application) => application.location],
    ["workplace_type", (application) => application.workplaceType],
    ["employment_type", (application) => application.employmentType],
    ["salary_min", (application) => application.salaryMin],
    ["salary_max", (application) => application.salaryMax],
    ["currency", (application) => application.currency],
    ["priority", (application) => application.priority],
    ["date_saved", (application) => application.dateSaved],
    ["date_applied", (application) => application.dateApplied],
    ["resume_version", (application) => application.resumeVersion?.name],
    ["notes", (application) => application.notes],
    ["created_at", (application) => application.createdAt],
    ["updated_at", (application) => application.updatedAt],
  ];

  const rows = applications.map((application) =>
    columns.map(([, getValue]) => escapeCsv(getValue(application))).join(","),
  );
  return [columns.map(([header]) => header).join(","), ...rows].join("\r\n");
}
