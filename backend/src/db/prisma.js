import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

let prisma;
let pool;
let prismaForTests;

export async function getPrismaAsync() {
  if (prismaForTests) return prismaForTests;
  if (!prisma) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}

export function getPrisma() {
  if (!prisma) {
    throw new Error("Prisma client is not initialized. Call getPrismaAsync() before database operations.");
  }
  return prisma;
}

export async function checkPrisma() {
  const client = await getPrismaAsync();
  await client.$queryRaw`SELECT 1`;
  return { ok: true };
}

export async function disconnectPrisma() {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
}

export function setPrismaForTests(client) {
  prismaForTests = client ?? undefined;
}
