import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Explicit, idempotent import. No emails are sent and no sessions are created.
// Run after prisma migrate deploy, with a direct connection to the chosen branch.
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString || new URL(connectionString).hostname.includes("-pooler")) throw new Error("Set DATABASE_URL_UNPOOLED to the target branch's direct connection.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query('LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE');
  const { rows } = await client.query('SELECT id, name, email, "emailVerifiedAt", "createdAt" FROM "User" WHERE "neonAuthId" IS NULL');
  for (const user of rows) {
    const existing = await client.query('SELECT id FROM neon_auth.user WHERE lower(email) = lower($1)', [user.email]);
    if (existing.rowCount) throw new Error(`Existing Neon identity conflicts with local account ${user.id}; review ownership before linking.`);
    const id = randomUUID();
    await client.query('INSERT INTO neon_auth.user (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())', [id, user.name || user.email.split("@")[0], user.email.toLowerCase(), Boolean(user.emailVerifiedAt), user.createdAt]);
    await client.query('INSERT INTO neon_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") VALUES ($1,$2::text,\'credential\',$3::uuid,NULL,NOW(),NOW())', [randomUUID(), id, id]);
    await client.query('UPDATE "User" SET "neonAuthId" = $1 WHERE id = $2', [id, user.id]);
  }
  await client.query("COMMIT");
  console.log(`Imported ${rows.length} accounts; application IDs and passwords preserved for first-login migration.`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { await client.end(); }
