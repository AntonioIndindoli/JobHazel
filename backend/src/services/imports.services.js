import { getPrismaAsync } from "../db/prisma.js";
import { detectJobSource, parseJobDescriptionWithFetch } from "./parser.services.js";
import { normalizeUrl } from "../utils/url.js";
import { maybeCreateAppliedFollowUpTask } from "./tasks.services.js";
import { APPLICATION_INCLUDE, withApplicationRelations } from "./applications.services.js";

function decorateDraft(draft) {
  if (!draft) return null;
  const publicDraft = { ...draft };
  delete publicDraft.captureId;
  const sourceInfo = detectJobSource({ sourceUrl: draft.sourceUrl, sourceDomain: draft.sourceDomain });
  return { ...publicDraft, source: sourceInfo.source };
}

async function findOrCreateCompany(prisma, userId, companyName) {
  if (!companyName) return null;
  return prisma.company.upsert({
    where: { userId_name: { userId, name: companyName } },
    create: { userId, name: companyName },
    update: {},
  });
}

async function findDuplicateApplications(prisma, userId, payload) {
  const normalizedUrl = normalizeUrl(payload.sourceUrl);
  const candidates = await prisma.application.findMany({
    where: { userId },
    include: APPLICATION_INCLUDE,
  });

  return candidates
    .filter((app) => {
      const byUrl = normalizedUrl && normalizeUrl(app.sourceUrl) === normalizedUrl;
      const byCompanyTitle =
        payload.companyName &&
        payload.title &&
        app.company?.name &&
        app.title &&
        app.company.name.trim().toLowerCase() === payload.companyName.trim().toLowerCase() &&
        app.title.trim().toLowerCase() === payload.title.trim().toLowerCase();
      return Boolean(byUrl || byCompanyTitle);
    })
    .map(withApplicationRelations);
}

function buildDuplicatePayloadFromDraft(parsed) {
  return {
    title: parsed.parsedTitle,
    companyName: parsed.parsedCompany,
    sourceUrl: parsed.sourceUrl,
  };
}

function pickOverride(overrides, key, fallback) {
  return Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] !== undefined ? overrides[key] : fallback;
}

function buildConversionPayload(draft, overrides = {}) {
  const sourceInfo = detectJobSource({ sourceUrl: draft.sourceUrl, sourceDomain: draft.sourceDomain });
  const salaryMin = pickOverride(overrides, "salaryMin", draft.parsedSalaryMin);
  const salaryMax = pickOverride(overrides, "salaryMax", draft.parsedSalaryMax);

  return {
    title: pickOverride(overrides, "title", draft.parsedTitle),
    companyName: pickOverride(overrides, "companyName", draft.parsedCompany),
    status: pickOverride(overrides, "status", "SAVED") ?? "SAVED",
    source: pickOverride(overrides, "source", sourceInfo.source),
    sourceUrl: normalizeUrl(pickOverride(overrides, "sourceUrl", draft.sourceUrl)),
    location: pickOverride(overrides, "location", draft.parsedLocation),
    salaryMin,
    salaryMax,
    description: pickOverride(overrides, "description", draft.parsedDescription),
    notes: pickOverride(overrides, "notes", null),
    dateApplied: pickOverride(overrides, "dateApplied", null),
  };
}

export async function createImportDraft(userId, payload) {
  const prisma = await getPrismaAsync();
  if (payload.captureId) {
    const existing = await prisma.importDraft.findUnique({
      where: { userId_captureId: { userId, captureId: payload.captureId } },
    });
    if (existing) {
      const importDraft = decorateDraft(existing);
      const duplicateCandidates = await findDuplicateApplications(
        prisma,
        userId,
        buildDuplicatePayloadFromDraft(importDraft),
      );
      return { importDraft, duplicateCandidates, skills: [], debug: null, reused: true };
    }
  }

  const parsed = await parseJobDescriptionWithFetch(payload);
  let importDraft;
  try {
    importDraft = await prisma.importDraft.create({
      data: {
        userId,
        captureId: payload.captureId,
        sourceUrl: parsed.sourceUrl,
        sourceDomain: parsed.sourceDomain,
        pageTitle: parsed.pageTitle,
        rawText: parsed.rawText,
        parsedTitle: parsed.parsedTitle,
        parsedCompany: parsed.parsedCompany,
        parsedLocation: parsed.parsedLocation,
        parsedSalaryMin: parsed.parsedSalaryMin,
        parsedSalaryMax: parsed.parsedSalaryMax,
        parsedDescription: parsed.parsedDescription,
        confidence: parsed.confidence,
      },
    });
  } catch (error) {
    if (error?.code !== "P2002" || !payload.captureId) throw error;
    importDraft = await prisma.importDraft.findUnique({
      where: { userId_captureId: { userId, captureId: payload.captureId } },
    });
    if (!importDraft) throw error;
  }

  const duplicateCandidates = await findDuplicateApplications(prisma, userId, buildDuplicatePayloadFromDraft(parsed));

  return {
    importDraft: decorateDraft(importDraft),
    duplicateCandidates,
    skills: parsed.skills,
    debug: parsed.debug ?? null,
  };
}

export async function getImportDraft(userId, id) {
  const prisma = await getPrismaAsync();
  const draft = await prisma.importDraft.findFirst({ where: { id, userId } });
  return decorateDraft(draft);
}

export async function getImportDraftResult(userId, id) {
  const prisma = await getPrismaAsync();
  const draft = await prisma.importDraft.findFirst({ where: { id, userId } });
  if (!draft) return null;
  const importDraft = decorateDraft(draft);
  const duplicateCandidates = await findDuplicateApplications(
    prisma,
    userId,
    buildDuplicatePayloadFromDraft(importDraft),
  );
  return { importDraft, duplicateCandidates };
}

export async function convertImportDraft(userId, id, overrides = {}) {
  const prisma = await getPrismaAsync();
  const draft = await prisma.importDraft.findFirst({ where: { id, userId } });
  if (!draft) return null;
  if (draft.convertedAt) return { alreadyConverted: true, importDraft: decorateDraft(draft) };

  const payload = buildConversionPayload(draft, overrides);
  if (!payload.title) return { missingFields: ["title"] };

  const duplicateCandidates = await findDuplicateApplications(prisma, userId, payload);
  if (duplicateCandidates.length && !overrides.allowDuplicate) return { duplicateCandidates };

  const result = await prisma.$transaction(async (tx) => {
    const company = await findOrCreateCompany(tx, userId, payload.companyName);
    const application = await tx.application.create({
      data: {
        userId,
        companyId: company?.id,
        title: payload.title,
        status: payload.status,
        source: payload.source,
        sourceUrl: payload.sourceUrl,
        location: payload.location,
        salaryMin: payload.salaryMin,
        salaryMax: payload.salaryMax,
        description: payload.description,
        notes: payload.notes,
        dateApplied: payload.dateApplied,
      },
      include: APPLICATION_INCLUDE,
    });

    const importDraft = await tx.importDraft.update({
      where: { id: draft.id },
      data: { convertedAt: new Date() },
    });

    await tx.activityLog.create({
      data: {
        userId,
        applicationId: application.id,
        type: "IMPORT_CONVERTED",
        message: `Import converted for ${application.title}`,
        metadata: {
          importDraftId: draft.id,
          sourceUrl: draft.sourceUrl,
          confidence: draft.confidence,
        },
      },
    });

    const createdTasks = [];
    if (application.status === "APPLIED") {
      const task = await maybeCreateAppliedFollowUpTask(tx, userId, application);
      if (task) createdTasks.push(task);
    }

    return { application: withApplicationRelations(application), importDraft: decorateDraft(importDraft), createdTasks };
  });

  return result;
}
