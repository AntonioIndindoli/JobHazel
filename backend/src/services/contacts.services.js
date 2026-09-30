import { getPrismaAsync } from "../db/prisma.js";

const CONTACT_INCLUDE = {
  company: { select: { id: true, name: true } },
  application: {
    select: {
      id: true,
      title: true,
      company: { select: { id: true, name: true } },
    },
  },
};

function withRelations(contact) {
  if (!contact) return null;

  return {
    ...contact,
    companyName: contact.company?.name ?? contact.application?.company?.name ?? null,
    applicationTitle: contact.application?.title ?? null,
  };
}

function buildContactWhere(userId, query = {}) {
  const where = { userId };

  if (query.applicationId) where.applicationId = String(query.applicationId);
  if (query.companyId) where.companyId = String(query.companyId);
  if (query.relationship) where.relationship = String(query.relationship);

  const search = String(query.search ?? query.q ?? "").trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { company: { name: { contains: search, mode: "insensitive" } } },
      { application: { title: { contains: search, mode: "insensitive" } } },
    ];
  }

  return where;
}

async function resolveCompany(tx, userId, payload) {
  const hasCompanyId = Object.prototype.hasOwnProperty.call(payload, "companyId");
  const hasCompanyName = Object.prototype.hasOwnProperty.call(payload, "companyName");

  if (hasCompanyId && payload.companyId) {
    const company = await tx.company.findFirst({
      where: { id: payload.companyId, userId },
      select: { id: true },
    });
    if (!company) return { missingCompany: true };
    return { companyId: company.id };
  }

  if (hasCompanyName && payload.companyName) {
    const company = await tx.company.upsert({
      where: { userId_name: { userId, name: payload.companyName } },
      create: { userId, name: payload.companyName },
      update: {},
      select: { id: true },
    });
    return { companyId: company.id };
  }

  if (hasCompanyId || hasCompanyName) return { companyId: null };

  return {};
}

async function resolveApplication(tx, userId, payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "applicationId")) return {};
  if (!payload.applicationId) return { applicationId: null };

  const application = await tx.application.findFirst({
    where: { id: payload.applicationId, userId },
    select: { id: true },
  });
  if (!application) return { missingApplication: true };
  return { applicationId: application.id };
}

function pickContactData(payload) {
  const data = {};

  for (const field of ["name", "role", "email", "phone", "linkedinUrl", "relationship", "notes"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      data[field] = payload[field];
    }
  }

  return data;
}

export async function listContacts(userId, query = {}) {
  const prisma = await getPrismaAsync();
  const contacts = await prisma.contact.findMany({
    where: buildContactWhere(userId, query),
    include: CONTACT_INCLUDE,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return contacts.map(withRelations);
}

export async function getContact(userId, id) {
  const prisma = await getPrismaAsync();
  const contact = await prisma.contact.findFirst({
    where: { id, userId },
    include: CONTACT_INCLUDE,
  });
  return withRelations(contact);
}

export async function createContact(userId, payload) {
  const prisma = await getPrismaAsync();

  return prisma.$transaction(async (tx) => {
    const company = await resolveCompany(tx, userId, payload);
    if (company.missingCompany) return { missingCompany: true };

    const application = await resolveApplication(tx, userId, payload);
    if (application.missingApplication) return { missingApplication: true };

    const contact = await tx.contact.create({
      data: {
        userId,
        ...pickContactData(payload),
        companyId: company.companyId,
        applicationId: application.applicationId,
      },
      include: CONTACT_INCLUDE,
    });

    return { contact: withRelations(contact) };
  });
}

export async function updateContact(userId, id, payload) {
  const prisma = await getPrismaAsync();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.contact.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!existing) return null;

    const company = await resolveCompany(tx, userId, payload);
    if (company.missingCompany) return { missingCompany: true };

    const application = await resolveApplication(tx, userId, payload);
    if (application.missingApplication) return { missingApplication: true };

    const data = {
      ...pickContactData(payload),
      ...company,
      ...application,
    };
    delete data.missingCompany;
    delete data.missingApplication;

    const contact = await tx.contact.update({
      where: { id },
      data,
      include: CONTACT_INCLUDE,
    });

    return { contact: withRelations(contact) };
  });
}

export async function deleteContact(userId, id) {
  const prisma = await getPrismaAsync();
  const existing = await prisma.contact.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) return false;

  await prisma.contact.delete({ where: { id } });
  return true;
}
